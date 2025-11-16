const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source'; // 사용 중인 버킷

app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // 1. Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download();

    // 2. 텍스트 오버레이를 위한 SVG 생성
    const svgText = `
      <svg width="1730" height="220">
        <style>
          .title { 
            fill: #FFFFFF;
            font-size: 42px; 
            font-weight: bold; 
            font-family: 'Noto Sans CJK KR';
            text-shadow: 2px 2px 4px #000000;
          }
        </style>
        <text x="50%" y="100" dominant-baseline="middle" text-anchor="middle" class="title">
          ${text}
        </text>
      </svg>
    `;
    const svgBuffer = Buffer.from(svgText);

    // 3. Sharp로 이미지 합성
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          gravity: 'center',
        },
      ])
      .toFormat('jpeg')
      .toBuffer();

    // 4. 브라우저에 결과 전송
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(outputBuffer);

  } catch (error) {
    console.error(error); // <-- 오류 로그를 Cloud Run 로그에 출력
    res.status(500).send('Error generating image');
  }
});

// Cloud Run 포트 설정
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
