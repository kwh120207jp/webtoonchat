const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const crypto = require('crypto'); // 랜덤 파일명 생성을 위해

// --- [설정] 위치 좌표 설정 파일 불러오기 ---
let imageConfig = {};
try {
  imageConfig = require('./imageConfig.json');
  console.log('Loaded custom image configuration.');
} catch (e) {
  console.log('No imageConfig.json found, using default settings only.');
}

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source'; 
const DATA_FILE = 'posts.json'; // 게시글 목록 관리용

// 미들웨어 설정
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 기본 대화창 설정
const DEFAULT_BOX = { width: 1261, height: 220, x: 285, y: 767 };

// --- [Helper] 게시글 목록 불러오기/저장하기 ---
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

// -------------------------------------------------------
// [요청하신 부분 복구] 1. 단순 생성 및 미리보기용 (저장 X)
// 이 경로는 이미지를 생성해서 브라우저에 보여주기만 합니다.
// -------------------------------------------------------
app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // [위치 계산 로직]
    const config = imageConfig[imageId] 
      ? { ...DEFAULT_BOX, ...imageConfig[imageId] } 
      : DEFAULT_BOX;

    // Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    // 텍스트 줄바꿈 처리
    const lines = text.split('\n');
    const lineHeight = 1.5; 
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

    // SVG 생성
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
    
    // 합성
    const outputBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgText), top: config.y, left: config.x }])
      .toFormat('jpeg')
      .toBuffer();

    // 결과 전송 (저장하지 않음)
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(outputBuffer);

  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating image');
  }
});

// -------------------------------------------------------
// [블로그 기능] 2. 게시글 목록 조회 API
// -------------------------------------------------------
app.get('/api/posts', async (req, res) => {
  const posts = await loadPosts();
  res.json(posts.reverse());
});

// -------------------------------------------------------
// [블로그 기능] 3. 게시글 저장 API (이미지 생성 + GCS 저장)
// "등록" 버튼을 눌렀을 때만 실행됩니다.
// -------------------------------------------------------
app.post('/api/posts', async (req, res) => {
  try {
    const { imageId, text, author } = req.body;

    // 이미지 생성 로직 (위와 동일하지만, 결과를 버킷에 저장함)
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

    // [저장] 생성된 이미지를 GCS outputs 폴더에 저장
    const filename = `outputs/${Date.now()}_${crypto.randomUUID().split('-')[0]}.jpg`;
    const outputFile = storage.bucket(bucketName).file(filename);
    
    await outputFile.save(outputBuffer, { contentType: 'image/jpeg', public: true });

    // [DB 갱신] 게시글 목록 업데이트
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
