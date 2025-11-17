const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source';

// --- 1920x1080 기준 대화창 위치 및 크기 ---
const BOX_WIDTH = 1261; // 대화창 가로 크기
const BOX_HEIGHT = 213; // 대화창 세로 크기

// 대화창의 '왼쪽 상단' 절대 좌표
const BOX_X = 285;
const BOX_Y = 767; 
// ------------------------------------

app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // 1. Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    // 2. URL 경로에 포함된 \n을 기준으로 줄바꿈 처리
    const lines = text.split('\n');
    const lineHeight = 1.5; // em 단위
    // 전체 텍스트 블록을 세로로 중앙 정렬하기 위해 첫 줄의 y 오프셋 계산
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

    // 3. 텍스트 오버레이를 위한 SVG 생성 (전체 대화창 크기)
    const svgText = `
      <svg width="${BOX_WIDTH}" height="${BOX_HEIGHT}">
        <style>
          .title { 
            fill: #ffffff;
            font-size: 42px; 
            font-family: "sans-serif";
          }
        </style>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" class="title">
          ${textSpans}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    // 3. Sharp로 이미지 합성 (대화창 위치에 정확히 배치)
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          top: BOX_Y,
          left: BOX_X,
        },
      ])
      .toFormat('jpeg')
      .toBuffer();

    // 4. 브라우저에 결과 전송
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(outputBuffer);

  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating image');
  }
});

// Cloud Run 포트 설정
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
