const express = require('express');
const sharp = require('sharp');
const { Storage } = require('@google-cloud/storage');
const path = require('path'); // 경로 처리를 위한 내장 모듈

// --- [설정] 위치 좌표 설정 파일 불러오기 ---
let imageConfig = {};
try {
  // 같은 폴더에 있는 imageConfig.json을 찾아서 로드합니다.
  // 파일이 없으면 무시하고 기본값만 사용합니다.
  imageConfig = require('./imageConfig.json');
  console.log('Loaded custom image configuration.');
} catch (e) {
  console.log('No imageConfig.json found, using default settings only.');
}
// --------------------------------------

const app = express();
const storage = new Storage();
const bucketName = 'my-dynamic-image-source'; // 

// --- [설정] 기본 대화창 위치 및 크기 (Default) ---
// imageConfig.json에 설정이 없는 이미지는 이 값을 따릅니다.
const DEFAULT_BOX = {
  width: 1261, // 대화창 가로 크기 
  height: 220, // 대화창 세로 크기 
  x: 285,      // 대화창 X 좌표 (왼쪽) 
  y: 767       // 대화창 Y 좌표 (상단) 
};
// ----------------------------------------------

// 1. 정적 파일(블로그, 메인화면) 연결
// 'public' 폴더를 웹 서버의 루트('/') 경로로 연결합니다.
// 사용자가 도메인에 그냥 접속하면 public/index.html을 보여줍니다.
app.use(express.static(path.join(__dirname, 'public')));


// 2. 동적 이미지 생성 API
app.get('/img/:imageId/text/:text', async (req, res) => {
  try {
    const { imageId, text } = req.params;

    // [위치 계산 로직]
    // 설정 파일에 해당 imageId 설정이 있으면 덮어쓰고, 없으면 기본값 사용
    const config = imageConfig[imageId] 
      ? { ...DEFAULT_BOX, ...imageConfig[imageId] } 
      : DEFAULT_BOX;

    // Storage에서 원본 이미지 파일 불러오기
    const file = storage.bucket(bucketName).file(`${imageId}.jpg`);
    const [imageBuffer] = await file.download(); // 

    // 텍스트 줄바꿈 처리 (\n 기준)
    const lines = text.split('\n'); // 
    const lineHeight = 1.5; // em 단위
    // 전체 텍스트 블록을 세로로 중앙 정렬하기 위한 오프셋 계산
    const firstLineYOffset = -((lines.length - 1) / 2) * lineHeight;
    
    const textSpans = lines.map((line, index) => 
        `<tspan x="50%" dy="${index === 0 ? firstLineYOffset : lineHeight}em">${line}</tspan>`
    ).join('');

    // 텍스트 오버레이를 위한 SVG 생성
    // config에서 가로(width), 세로(height) 값을 가져와 적용합니다.
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

    // Sharp로 이미지 합성
    // config에서 좌표(x, y) 값을 가져와 적용합니다.
    const outputBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: svgBuffer,
          top: config.y, 
          left: config.x,
        },
      ])
      .toFormat('jpeg')
      .toBuffer();

    // 브라우저에 결과 전송
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600'); // 
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
