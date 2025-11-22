document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const writeSection = document.getElementById('write-section');
    const loginForm = document.getElementById('login-form');
    
    // --- 1. 로그인 처리 ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const userid = document.getElementById('userid').value;
        const userpw = document.getElementById('userpw').value;

        // [임시] 간단한 아이디/비번 체크 (실제 서비스에선 서버 인증 필요)
        // 아이디: admin, 비번: 1234 일 때만 로그인 성공
        if (userid === 'admin' && userpw === '1234') {
            alert('로그인 성공! 관리자 모드로 진입합니다.');
            loginSection.classList.add('hidden');
            writeSection.classList.remove('hidden');
        } else {
            alert('아이디 또는 비밀번호가 틀렸습니다.');
        }
    });

    // --- 2. 로그아웃 처리 ---
    document.getElementById('logout-btn').addEventListener('click', () => {
        loginSection.classList.remove('hidden');
        writeSection.classList.add('hidden');
        document.getElementById('userid').value = '';
        document.getElementById('userpw').value = '';
    });

    // --- 3. 이미지 생성 로직 ---
    const generateBtn = document.getElementById('generate-btn');
    const resultImage = document.getElementById('result-image');
    const placeholderText = document.getElementById('placeholder-text');

    generateBtn.addEventListener('click', () => {
        const imageId = document.getElementById('image-select').value;
        const dialogue = document.getElementById('dialogue').value.trim();

        if (!dialogue) {
            alert('대사를 입력해주세요!');
            return;
        }

        // 서버 API 경로 생성 (줄바꿈 문자를 URL 안전하게 인코딩)
        // 예: /img/scene1/text/안녕하세요
        const encodedText = encodeURIComponent(dialogue);
        const imageUrl = `/img/${imageId}/text/${encodedText}`;

        // 이미지 소스 업데이트 (캐시 방지를 위해 랜덤 쿼리 추가 가능하지만 일단 생략)
        resultImage.src = imageUrl;
        
        // 로딩 처리 UI
        resultImage.style.display = 'none';
        placeholderText.style.display = 'block';
        placeholderText.textContent = '이미지를 생성하는 중입니다...';

        resultImage.onload = () => {
            resultImage.style.display = 'block';
            placeholderText.style.display = 'none';
        };

        resultImage.onerror = () => {
            placeholderText.textContent = '이미지 생성 실패! 서버 로그를 확인하세요.';
        };
    });
});
