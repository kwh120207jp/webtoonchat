const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source';

// --- 1920x1080 기준 대화창 위치 및 크기 ---
const BOX_WIDTH = 1830; // 대화창 가로 크기
const BOX_HEIGHT = 220; // 대화창 세로 크기

// 대화창의 '왼쪽 상단' 절대 좌표
// X: (1920 - 1830) / 2 = 45
const BOX_X = 100;
// Y: 1080 (화면 바닥) - 100 (아래 여백) - 220 (대화창 높이) = 760
const BOX_Y = 760; 
// ------------------------------------

app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // 1. Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    // 2. 텍스트 오버레이를 위한 SVG 생성 (전체 대화창 크기)
    const svgText = `
      <svg width="${BOX_WIDTH}" height="${BOX_HEIGHT}">
        <style>
          @font-face {
            font-family: 'SCDream3';
            src: url('SCDream3.otf') format('opentype');
          }
          .title { 
            fill: #FFFFFF;
            font-size: 52px; 
            font-weight: bold; 
            font-family: 'SCDream3';
            text-shadow: 2px 2px 4px #000000;
          }
        </style>
        <text x="120" y="50%" dominant-baseline="middle" text-anchor="start" class="title">
          ${text}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    // 3. Sharp로 이미지 합성 (대화창 위치에 정확히 배치)
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          top: BOX_Y,  // 760
          left: BOX_X, // 45
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
