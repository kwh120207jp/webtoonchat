const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source';

// --- 우리가 논의한 값 ---
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

// 대화창 텍스트 영역 크기 (1830x220에서 좌우 여백 50씩 뺌)
const TEXT_AREA_WIDTH = 1730; 
const TEXT_AREA_HEIGHT = 220;

// 대화창 텍스트 영역의 '왼쪽 상단' 좌표
// X: 화면 중앙 정렬 (1920 - 1730) / 2 = 95
const TEXT_AREA_X = 95;
// Y: 화면 하단에서 100px 띄우고, 박스 높이(220)만큼 위로
// (1080 - 100) - 220 = 760
const TEXT_AREA_Y = 760; 
// -------------------------

app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // 1. Storage에서 원본 이미지 파일 불러오기 (1920x1080 가정)
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    // 2. 텍스트 오버레이를 위한 SVG 생성 (수정됨)
    const svgText = `
      <svg width="${TEXT_AREA_WIDTH}" height="${TEXT_AREA_HEIGHT}">
        <style>
          .title { 
            fill: #FFFFFF;
            font-size: 42px; 
            font-weight: bold; 
            font-family: 'Noto Sans CJK KR';
            text-shadow: 2px 2px 4px #000000;
          }
        </style>
        <text x="50" y="50%" dominant-baseline="middle" text-anchor="start" class="title">
          ${text}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    // 3. Sharp로 이미지 합성 (수정됨)
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          // gravity 대신 'top', 'left'로 정확한 위치 지정
          top: TEXT_AREA_Y,  // 760
          left: TEXT_AREA_X, // 95
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
