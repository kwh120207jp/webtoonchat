document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const writeSection = document.getElementById('write-section');
    const feedArea = document.getElementById('feed-area');
    const loginForm = document.getElementById('login-form');

    // --- 1. 로그인 (임시) ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userid = document.getElementById('userid').value;
        const userpw = document.getElementById('userpw').value;

        // 간단한 관리자 체크
        if (userid === 'admin' && userpw === '1234') {
            alert('관리자님, 환영합니다! (일촌공개)');
            loginSection.classList.add('hidden');
            writeSection.classList.remove('hidden');
            loadPosts(); // 로그인 성공 시 게시글 목록 불러오기
        } else {
            alert('비밀번호가 일치하지 않습니다.');
        }
    });

    // --- 2. 로그아웃 ---
    document.getElementById('logout-btn').addEventListener('click', () => {
        loginSection.classList.remove('hidden');
        writeSection.classList.add('hidden');
        document.getElementById('userid').value = '';
        document.getElementById('userpw').value = '';
    });

    // --- 3. 게시글 작성 및 저장 (서버로 전송) ---
    const generateBtn = document.getElementById('generate-btn');
    
    generateBtn.addEventListener('click', async () => {
        const imageId = document.getElementById('image-select').value;
        const dialogue = document.getElementById('dialogue').value.trim();

        if (!dialogue) {
            alert('대사를 입력해주세요!');
            return;
        }

        // 로딩 표시
        generateBtn.textContent = '저장 중...';
        generateBtn.disabled = true;

        try {
            // API 호출: 이미지 생성 및 저장 요청
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageId: imageId,
                    text: dialogue,
                    author: '관리자'
                })
            });

            const result = await response.json();

            if (result.success) {
                // 성공 시 입력창 초기화하고 목록 다시 불러오기
                document.getElementById('dialogue').value = '';
                alert('게시글이 등록되었습니다!');
                loadPosts();
            } else {
                alert('저장 실패: ' + result.message);
            }

        } catch (error) {
            console.error('Error:', error);
            alert('서버 통신 오류가 발생했습니다.');
        } finally {
            generateBtn.textContent = '등록';
            generateBtn.disabled = false;
        }
    });

    // --- 4. 게시글 목록 불러오기 ---
    async function loadPosts() {
        feedArea.innerHTML = '<div class="loading-msg">게시글을 불러오는 중...</div>';
        
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();

            feedArea.innerHTML = ''; // 초기화

            if (posts.length === 0) {
                feedArea.innerHTML = '<div class="loading-msg">아직 작성된 게시글이 없습니다.<br>첫 글을 작성해보세요!</div>';
                return;
            }

            posts.forEach((post, index) => {
                const postEl = document.createElement('div');
                postEl.className = 'feed-post';
                // 줄바꿈 처리 및 HTML 렌더링
                const formattedText = post.text.replace(/\n/g, '<br>');
                
                postEl.innerHTML = `
                    <div class="feed-header">
                        <span class="no">no.${posts.length - index}</span>
                        <span>${post.author} | ${post.date}</span>
                    </div>
                    <img src="${post.imageUrl}" class="feed-img" alt="웹툰 짤">
                    <div class="feed-text">
                        ${formattedText}
                    </div>
                `;
                feedArea.appendChild(postEl);
            });

        } catch (error) {
            feedArea.innerHTML = '<div class="loading-msg">목록을 불러오는데 실패했습니다.</div>';
        }
    }
});
