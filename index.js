const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const crypto = require('crypto'); 

// --- [설정] 위치 좌표 설정 파일 ---
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

// 미들웨어 설정
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 기본 대화창 설정
const DEFAULT_BOX = { width: 1261, height: 220, x: 285, y: 767 };

// [변경됨] GET /api/posts, POST /api/posts 라우트 제거
// 게시판 데이터 관리는 이제 클라이언트(Firebase Firestore)에서 전적으로 담당합니다.

// --- [API] 이미지 생성 및 저장 (POST) ---
// ※ 이 부분은 요청하신 대로 수정하지 않고 그대로 둡니다.
// ※ 현재 프론트엔드에서는 이 API를 호출하지 않지만, 기능 보존을 위해 남겨둡니다.
app.post('/api/generate', async (req, res) => {
  try {
    const { text, style } = req.body; 
    const author = req.body.author || '작자미상';

    // 1. 기본 이미지 선택
    let baseImage = 'public/base_image.jpg'; 
    let config = DEFAULT_BOX;

    if (style && imageConfig[style]) {
       config = imageConfig[style];
    }

    // 2. Sharp로 이미지 합성
    const imageBuffer = await sharp(baseImage).toBuffer();
    
    // 텍스트 SVG 생성
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

    // [저장] GCS 업로드
    const filename = `outputs/${Date.now()}_${crypto.randomUUID().split('-')[0]}.jpg`;
    const outputFile = storage.bucket(bucketName).file(filename);
    
    await outputFile.save(outputBuffer, { contentType: 'image/jpeg', public: true });

    // 성공 응답
    res.json({ 
        success: true, 
        imageUrl: `https://storage.googleapis.com/${bucketName}/${filename}`,
        text, 
        author 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
