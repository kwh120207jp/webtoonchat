const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer'); // [추가] 파일 업로드를 위한 패키지

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
const DATA_FILE = 'posts.json';

// [추가] Multer 설정 (메모리에 임시 저장 후 GCS로 넘김)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB 제한
});

// 미들웨어 설정
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
// [요청하신 부분 유지] 1. 단순 생성 및 미리보기용 (건드리지 않음)
// -------------------------------------------------------
app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    const config = imageConfig[imageId] 
      ? { ...DEFAULT_BOX, ...imageConfig[imageId] } 
      : DEFAULT_BOX;

    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    const lines = text.split('\n');
    const lineHeight = 1.5; 
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

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
    
    const outputBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgText), top: config.y, left: config.x }])
      .toFormat('jpeg')
      .toBuffer();

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
// [수정됨] 3. 게시글 저장 API (파일 업로드 방식)
// 이제 서버에서 합성을 하지 않고, 클라이언트가 보낸 파일을 그대로 저장합니다.
// -------------------------------------------------------
app.post('/api/posts', upload.single('imageFile'), async (req, res) => {
  try {
    // 파일이 없으면 에러 처리
    if (!req.file) {
      return res.status(400).json({ success: false, message: '이미지 파일이 필요합니다.' });
    }

    const { text, author } = req.body;

    // [저장] 업로드된 파일을 GCS outputs 폴더에 저장
    const filename = `uploads/${Date.now()}_${crypto.randomUUID().split('-')[0]}.jpg`;
    const outputFile = storage.bucket(bucketName).file(filename);
    
    // 업로드된 버퍼(req.file.buffer)를 바로 저장
    await outputFile.save(req.file.buffer, { 
        contentType: req.file.mimetype, 
        public: true 
    });

    // [DB 갱신]
    const posts = await loadPosts();
    const newPost = {
      id: Date.now(),
      imageUrl: `https://storage.googleapis.com/${bucketName}/${filename}`,
      text: text || '', // 텍스트가 없을 수도 있음
      author: author || 'Unknown',
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
