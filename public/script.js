const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path');

// --- [설정] 위치 좌표 설정 파일 불러오기 ---
let imageConfig = {};
try {
  imageConfig = require('./imageConfig.json');
  console.log('Loaded custom image configuration.');
} catch (e) {
  console.log('No imageConfig.json found, using default settings only.');
}

const app = express();
// JSON 요청 본문을 처리하기 위해 미들웨어 추가
app.use(express.json()); 

const storage = new Storage();
const bucketName = 'my-dynamic-image-source';

// --- [설정] 기본값 ---
const DEFAULT_BOX = {
  width: 1261, height: 220, x: 285, y: 767
};

app.use(express.static(path.join(__dirname, 'public')));

// [공통 함수] 이미지 생성 로직 분리
async function generateWebtoonImage(imageId, text) {
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
            font-family: "sans-serif"; /* 한글 폰트가 시스템에 있다면 적용 권장 */
          }
        </style>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">
          ${textSpans}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    return await sharp(imageBuffer)
      .composite([{ input: svgBuffer, top: config.y, left: config.x }])
      .toFormat('jpeg')
      .toBuffer();
}

// 1. 기존: 단순 조회 (미리보기용)
app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;
    const outputBuffer = await generateWebtoonImage(imageId, text);
    
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(outputBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating image');
  }
});

// 2. [신규] 게시글 저장 (GCS 업로드)
app.post('/api/save', async (req, res) => {
    try {
        const { imageId, text, author } = req.body;
        
        // 1. 이미지 생성
        const outputBuffer = await generateWebtoonImage(imageId, text);

        // 2. 파일명 생성 (타임스탬프 기반)
        const filename = `posts/${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
        const file = storage.bucket(bucketName).file(filename);

        // 3. GCS에 저장
        await file.save(outputBuffer, {
            metadata: {
                contentType: 'image/jpeg',
                metadata: {
                    author: author,
                    originalText: text
                }
            }
        });

        // 4. 저장된 경로 반환 (공개 접근이 허용된 버킷이라 가정하거나, 서명된 URL 필요)
        // 여기서는 단순히 파일명을 반환합니다.
        res.json({ success: true, filename: filename, message: '미니홈피 사진첩에 저장되었습니다!' });

    } catch (error) {
        console.error('Save failed:', error);
        res.status(500).json({ success: false, message: '저장에 실패했습니다.' });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
