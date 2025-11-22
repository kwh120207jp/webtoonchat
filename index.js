const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');

// [추가] 설정 파일 불러오기
// (파일이 없거나 에러가 나도 서버가 죽지 않도록 예외처리 하거나, 빈 객체로 초기화)
let imageConfig = {};
try {
  imageConfig = require('./imageConfig.json');
} catch (e) {
  console.log('No custom config file found, using defaults only.');
}

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source';

// [변경] 기본값(Default) 설정 정의
const DEFAULT_BOX = {
  width: 1261, // 기본 가로 크기
  height: 220, // 기본 세로 크기
  x: 285,      // 기본 X 좌표
  y: 767       // 기본 Y 좌표
};

app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // [핵심 로직] 설정 파일에 해당 imageId가 있으면 가져오고, 없으면 기본값 사용
    // 부분적인 설정(예: x만 바꿈)도 지원하기 위해 spread operator(...) 사용
    const config = imageConfig[imageId] 
      ? { ...DEFAULT_BOX, ...imageConfig[imageId] } 
      : DEFAULT_BOX;

    // 1. Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    // 2. 텍스트 줄바꿈 처리
    const lines = text.split('\n');
    const lineHeight = 1.5; 
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

    // 3. SVG 생성 (동적 크기 적용: config.width, config.height)
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

    // 4. Sharp로 이미지 합성 (동적 위치 적용: config.top, config.left)
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          top: config.y,  // 동적 Y 좌표
          left: config.x, // 동적 X 좌표
        },
      ])
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

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
