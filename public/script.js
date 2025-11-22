document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const writeSection = document.getElementById('write-section');
    const feedArea = document.getElementById('feed-area');
    const loginForm = document.getElementById('login-form');

    const previewBtn = document.getElementById('preview-btn');
    const previewArea = document.getElementById('preview-area');
    const previewImg = document.getElementById('preview-img');
    const generateBtn = document.getElementById('generate-btn');

    // --- 1. 로그인 ---\
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userid = document.getElementById('userid').value;
        const userpw = document.getElementById('userpw').value;

        if (userid === 'admin' && userpw === '1234') {
            alert('관리자님, 환영합니다! (일촌공개)');
            loginSection.classList.add('hidden');
            writeSection.classList.remove('hidden');
            loadPosts();
        } else {
            alert('비밀번호가 일치하지 않습니다.');
        }
    });

    // --- 2. 로그아웃 ---\
    document.getElementById('logout-btn').addEventListener('click', () => {
        loginSection.classList.remove('hidden');
        writeSection.classList.add('hidden');
        document.getElementById('userid').value = '';
        document.getElementById('userpw').value = '';
        previewArea.classList.add('hidden'); // 미리보기 초기화
    });

    // --- 3. [미리보기] 버튼 (수정됨: 서버요청 X, 로컬 URL 표시) ---
    previewBtn.addEventListener('click', () => {
        const imageUrl = document.getElementById('image-url').value;
        
        if (!imageUrl) {
            alert('이미지 URL을 입력해주세요.');
            return;
        }

        // 서버 통신 없이 바로 이미지 띄우기
        previewImg.src = imageUrl;
        previewArea.classList.remove('hidden');
    });

    // --- 4. [등록] 버튼 (수정됨: /api/generate -> /api/posts 호출) ---
    generateBtn.addEventListener('click', async () => {
        const author = document.getElementById('author').value || '익명';
        const text = document.getElementById('post-text').value;
        const imageUrl = document.getElementById('image-url').value;

        if (!text) {
            alert('내용을 입력해주세요.');
            return;
        }

        // 버튼 비활성화 (중복 클릭 방지)
        generateBtn.textContent = '등록 중...';
        generateBtn.disabled = true;

        try {
            // 이미지 생성(/api/generate)이 아니라 단순 게시글 등록(/api/posts) 호출
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, author, imageUrl })
            });
            
            const result = await response.json();

            if (result.success) {
                alert('게시글이 등록되었습니다!');
                // 입력창 초기화
                document.getElementById('post-text').value = '';
                document.getElementById('image-url').value = '';
                previewArea.classList.add('hidden');
                
                // 목록 새로고침
                loadPosts();
            } else {
                alert('오류가 발생했습니다: ' + result.error);
            }
        } catch (error) {
            console.error(error);
            alert('서버 통신 중 오류가 발생했습니다.');
        } finally {
            generateBtn.textContent = '등록';
            generateBtn.disabled = false;
        }
    });

    // --- 5. 게시글 목록 불러오기 ---\
    async function loadPosts() {
        feedArea.innerHTML = '<div class="loading-msg">게시글을 불러오는 중...</div>';
        
        try {
            const response = await fetch('/api/posts');
            const posts = await response.json();

            feedArea.innerHTML = '';

            if (posts.length === 0) {
                feedArea.innerHTML = '<div class="loading-msg">아직 작성된 게시글이 없습니다.<br>첫 글을 작성해보세요!</div>';
                return;
            }

            // 최신글이 위로 오도록 역순 정렬
            posts.reverse().forEach((post, index) => {
                const postEl = document.createElement('div');
                postEl.className = 'feed-post';
                // 줄바꿈 처리
                const formattedText = post.text ? post.text.replace(/\n/g, '<br>') : '';
                
                postEl.innerHTML = `
                    <div class="feed-header">
                        <span class="no">no.${posts.length - index}</span>
                        <span>${post.author} | ${post.date}</span>
                    </div>
                    <img src="${post.imageUrl}" class="feed-img" alt="게시글 이미지" onerror="this.style.display='none'">
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
