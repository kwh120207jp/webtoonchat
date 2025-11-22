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
    public: true
  });
}

// --- [API] 게시글 목록 조회 (GET) ---
app.get('/api/posts', async (req, res) => {
  const posts = await loadPosts();
  res.json(posts);
});

// --- [API] 단순 게시글 등록 (POST) - 새로 추가됨 ---
// 이미지를 생성하지 않고, URL과 텍스트만 저장합니다.
app.post('/api/posts', async (req, res) => {
  try {
    const { text, author, imageUrl } = req.body;

    const posts = await loadPosts();
    const newPost = {
      id: Date.now(),
      imageUrl: imageUrl || 'https://via.placeholder.com/400x200?text=No+Image', // 이미지가 없으면 기본 이미지
      text,
      author: author || '익명',
      date: new Date().toLocaleDateString()
    };

    posts.push(newPost);
    await savePosts(posts);

    res.json({ success: true, post: newPost });
  } catch (error) {
    console.error('Error saving post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- [API] 이미지 생성 및 저장 (POST) ---
// ※ 기존 로직 유지 (요청하신 대로 건드리지 않음)
app.post('/api/generate', async (req, res) => {
  try {
    const { text, style } = req.body; 
    const author = req.body.author || '작자미상';

    // 1. 기본 이미지 선택
    let baseImage = 'public/base_image.jpg'; 
    let config = DEFAULT_BOX;

    if (style && imageConfig[style]) {
       // style이 있으면 해당 설정 사용 (구현 필요 시 확장)
       // 예: baseImage = `public/${style}.jpg`;
       config = imageConfig[style];
    }

    // 2. Sharp로 이미지 합성 (텍스트 오버레이)
    const imageBuffer = await sharp(baseImage).toBuffer();
    
    // 텍스트 SVG 생성 (간단한 줄바꿈 처리 포함)
    const lineHeight = 1.2;
    const fontSize = 32; 
    const maxCharsPerLine = 20; 
    const lines = [];
    for (let i = 0; i < text.length; i += maxCharsPerLine) {
        lines.push(text.substring(i, i + maxCharsPerLine));
    }

    const totalTextHeight = lines.length * fontSize * lineHeight;
    const firstLineYOffset = (config.height - totalTextHeight) / 2 + fontSize;

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
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
