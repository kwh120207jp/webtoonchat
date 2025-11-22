document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const writeSection = document.getElementById('write-section');
    const feedArea = document.getElementById('feed-area');
    const loginForm = document.getElementById('login-form');

    const previewBtn = document.getElementById('preview-btn');
    const previewArea = document.getElementById('preview-area');
    const previewImg = document.getElementById('preview-img');
    const generateBtn = document.getElementById('generate-btn');

    // --- 1. 로그인 ---
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

    // --- 2. 로그아웃 ---
    document.getElementById('logout-btn').addEventListener('click', () => {
        loginSection.classList.remove('hidden');
        writeSection.classList.add('hidden');
        document.getElementById('userid').value = '';
        document.getElementById('userpw').value = '';
        previewArea.classList.add('hidden'); // 미리보기 초기화
    });

    // --- 3. [미리보기] 버튼 (단순 생성, 저장 안함) ---
    // 복구하신 /img/... 경로를 사용합니다.
    previewBtn.addEventListener('click', () => {
        const imageId = document.getElementById('image-select').value;
        const dialogue = document.getElementById('dialogue').value.trim();

        if (!dialogue) {
            alert('대사를 입력해주세요!');
            return;
        }

        const encodedText = encodeURIComponent(dialogue);
        // 저장하지 않고 이미지만 받아오는 URL
        const imageUrl = `/img/${imageId}/text/${encodedText}?t=${Date.now()}`; // 캐시 방지용 쿼리 추가

        previewImg.src = imageUrl;
        previewArea.classList.remove('hidden');
    });

    // --- 4. [등록] 버튼 (서버에 저장) ---
    // /api/posts 경로를 사용해 이미지를 생성하고 저장합니다.
    generateBtn.addEventListener('click', async () => {
        const imageId = document.getElementById('image-select').value;
        const dialogue = document.getElementById('dialogue').value.trim();

        if (!dialogue) {
            alert('대사를 입력해주세요!');
            return;
        }

        if (!confirm('정말 등록하시겠습니까? (사진첩에 저장됩니다)')) return;

        generateBtn.textContent = '저장 중...';
        generateBtn.disabled = true;

        try {
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
                document.getElementById('dialogue').value = '';
                previewArea.classList.add('hidden'); // 등록 후 미리보기 닫기
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

    // --- 5. 게시글 목록 불러오기 ---
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

            posts.forEach((post, index) => {
                const postEl = document.createElement('div');
                postEl.className = 'feed-post';
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
