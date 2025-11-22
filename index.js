const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const crypto = require('crypto');

// --- [설정] 위치 좌표 설정 파일 불러오기 ---
let imageConfig = {};
try {
  // 같은 폴더에 있는 imageConfig.json을 찾아서 로드합니다.
  // 파일이 없으면 무시하고 기본값만 사용합니다.
  imageConfig = require('./imageConfig.json');
  console.log('Loaded custom image configuration.');
} catch (e) {
  console.log('No imageConfig.json found, using default settings only.');
}
// --------------------------------------

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source';
const DATA_FILE = 'posts.json'; // 게시글 데이터 파일

// 미들웨어 설정 (게시글 저장을 위해 json 파싱 필요)
app.use(express.json());

// --- [설정] 기본 대화창 위치 및 크기 (Default) ---
const DEFAULT_BOX = {
  width: 1261, // 대화창 가로 크기 
  height: 220, // 대화창 세로 크기 
  x: 285,      // 대화창 X 좌표 (왼쪽) 
  y: 767       // 대화창 Y 좌표 (상단) 
};
// ----------------------------------------------

// 1. 정적 파일(블로그, 메인화면) 연결
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper 함수: 게시글 데이터 관리 ---
async function loadPosts() {
  try {
    const file = storage.bucket(bucketName).file(DATA_FILE);
    const [exists] = await file.exists();
    if (!exists) return [];
    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch (error) { return []; }
}

async function savePosts(posts) {
  const file = storage.bucket(bucketName).file(DATA_FILE);
  await file.save(JSON.stringify(posts, null, 2), {
    contentType: 'application/json',
    cacheControl: 'no-cache'
  });
}


// =======================================================
// 2. [요청하신 원본 복구] 동적 이미지 생성 API (저장 X)
// =======================================================
app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // [위치 계산 로직]
    // 설정 파일에 해당 imageId 설정이 있으면 덮어쓰고, 없으면 기본값 사용
    const config = imageConfig[imageId] 
      ? { ...DEFAULT_BOX, ...imageConfig[imageId] } 
      : DEFAULT_BOX;

    // Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download(); 

    // 텍스트 줄바꿈 처리 (\n 기준)
    const lines = text.split('\n'); 
    const lineHeight = 1.5; // em 단위
    // 전체 텍스트 블록을 세로로 중앙 정렬하기 위한 오프셋 계산
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

    // 텍스트 오버레이를 위한 SVG 생성
    const svgText = `
      <svg width="${config.width}" height="${config.height}">
        <style>
          .title { 
            fill: #ffffff;
            font-size: 48px; 
            font-family: "sans-serif";
          }
        </style>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">
          ${textSpans}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    // Sharp로 이미지 합성
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          top: config.y, 
          left: config.x,
        },
      ])
      .toFormat('jpeg')
      .toBuffer();

    // 브라우저에 결과 전송
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600'); 
    res.send(outputBuffer);

  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating image');
  }
});


// =======================================================
// 3. 게시글 저장 및 목록 조회 API (블로그 기능용)
// =======================================================
app.get('/api/posts', async (req, res) => {
  const posts = await loadPosts();
  res.json(posts.reverse());
});

app.post('/api/posts', async (req, res) => {
  try {
    const { imageId, text, author } = req.body;
    
    // 이미지 생성 (저장을 위해 다시 생성)
    const config = imageConfig[imageId] ? { ...DEFAULT_BOX, ...imageConfig[imageId] } : DEFAULT_BOX;
    const originalFile = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await originalFile.download();

    const lines = text.split('\n');
    const lineHeight = 1.5;
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    const textSpans = lines.map((line, index) => `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`).join('');
    const svgText = `<svg width="${config.width}" height="${config.height}"><style>.title { fill: #ffffff; font-size: 48px; font-family: "sans-serif"; }</style><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">${textSpans}</text></svg>`;
    
    const outputBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgText), top: config.y, left: config.x }])
      .toFormat('jpeg')
      .toBuffer();

    // GCS에 저장 (outputs 폴더)
    const filename = `outputs/${Date.now()}_${crypto.randomUUID().split('-')[0]}.jpg`;
    const outputFile = storage.bucket(bucketName).file(filename);
    await outputFile.save(outputBuffer, { contentType: 'image/jpeg', public: true });

    // DB(posts.json) 갱신
    const posts = await loadPosts();
    const newPost = {
      id: Date.now(),
      imageUrl: `https://storage.googleapis.com/${bucketName}/${filename}`,
      text,
      author,
      date: new Date().toLocaleDateString()
    };
    posts.push(newPost);
    await savePosts(posts);

    res.json({ success: true, post: newPost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error creating post' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
