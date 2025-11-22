const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const crypto = require('crypto');

// --- 설정 파일 로드 (없으면 무시) ---
let imageConfig = {};
try {
  imageConfig = require('./imageConfig.json');
} catch (e) {
  console.log('기본 설정 사용 (imageConfig.json 없음)');
}

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source'; 
const DATA_FILE = 'posts.json';

// 미들웨어
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 기본값
const DEFAULT_BOX = { width: 1261, height: 220, x: 285, y: 767 };

// --- 게시글 도우미 함수 ---
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
// 1. [문제의 구간] 단순 이미지 생성 (저장 X, 미리보기용)
// =======================================================
app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // 설정 확인
    const config = imageConfig[imageId] 
      ? { ...DEFAULT_BOX, ...imageConfig[imageId] } 
      : DEFAULT_BOX;

    // 원본 이미지 다운로드
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    
    // [디버깅] 파일이 실제로 있는지 확인
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`[Error] 파일 없음: ${imageId}.jpg 가 버킷에 없습니다.`);
      return res.status(404).send(`Image not found: ${imageId}.jpg`);
    }

    const [imageBuffer] = await file.download();

    // 텍스트 처리
    const lines = text.split('\n');
    const lineHeight = 1.5; 
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

    const svgText = `
      <svg width="${config.width}" height="${config.height}">
        <style>
          .title { fill: #ffffff; font-size: 48px; font-family: "sans-serif"; }
        </style>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">
          ${textSpans}
        </text>
      </svg>
    `;

    // 이미지 합성
    const outputBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgText), top: config.y, left: config.x }])
      .toFormat('jpeg')
      .toBuffer();

    // 전송
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(outputBuffer);

  } catch (error) {
    console.error('[Generate Error]', error); // 에러 로그 출력
    res.status(500).send('Error generating image');
  }
});

// =======================================================
// 2. 게시글 저장 API (등록 버튼용)
// =======================================================
app.get('/api/posts', async (req, res) => {
  const posts = await loadPosts();
  res.json(posts.reverse());
});

app.post('/api/posts', async (req, res) => {
  try {
    const { imageId, text, author } = req.body;
    
    // 로직 동일 (생략 가능하지만 안정성을 위해 포함)
    const config = imageConfig[imageId] ? { ...DEFAULT_BOX, ...imageConfig[imageId] } : DEFAULT_BOX;
    const originalFile = storage.bucket(bucketName).file(`${imageId}.jpg`);
    
    // [디버깅] 저장 시에도 파일 확인
    const [exists] = await originalFile.exists();
    if (!exists) {
        return res.status(404).json({ success: false, message: '원본 이미지가 없습니다.' });
    }

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

    const filename = `outputs/${Date.now()}_${crypto.randomUUID().split('-')[0]}.jpg`;
    const outputFile = storage.bucket(bucketName).file(filename);
    await outputFile.save(outputBuffer, { contentType: 'image/jpeg', public: true });

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
    console.error('[Save Error]', error);
    res.status(500).json({ success: false, message: 'Error creating post' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
