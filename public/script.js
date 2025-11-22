// Firebase 라이브러리 가져오기
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// -----------------------------------------------------------
// [중요] 아래 firebaseConfig 안에 본인의 키를 붙여넣으세요!
// -----------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB5YDvSFoy3KtvaAVo-ZHv7L3lWfzctNtY",
  authDomain: "webtoonchat.firebaseapp.com",
  projectId: "webtoonchat",
  storageBucket: "webtoonchat.firebasestorage.app",
  messagingSenderId: "992694632208",
  appId: "1:992694632208:web:74893f699ea23e9c78af95",
  measurementId: "G-PZ42VK6LN5"
};
// -----------------------------------------------------------

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM 요소 가져오기
const loginSection = document.getElementById('login-section');
const writeSection = document.getElementById('write-section');
const feedArea = document.getElementById('feed-area');
const loginForm = document.getElementById('login-form');
const previewBtn = document.getElementById('preview-btn');
const previewArea = document.getElementById('preview-area');
const previewImg = document.getElementById('preview-img');
const generateBtn = document.getElementById('generate-btn');

let currentUser = null;

// 1. 인증 처리 (익명 로그인)
async function initAuth() {
    try {
        await signInAnonymously(auth);
    } catch (error) {
        console.error("Auth Failed:", error);
        feedArea.innerHTML = '<div class="loading-msg">인증 오류가 발생했습니다.<br>F12 콘솔을 확인해주세요.</div>';
    }
}

// 2. 실시간 게시글 리스너
function subscribePosts() {
    // 'posts' 컬렉션을 바라봅니다.
    const postsRef = collection(db, 'posts');
    // 날짜(date)가 아니라 id(timestamp) 기준으로 내림차순 정렬
    const q = query(postsRef, orderBy("id", "desc"));

    onSnapshot(q, (snapshot) => {
        feedArea.innerHTML = '';
        
        if (snapshot.empty) {
            feedArea.innerHTML = '<div class="loading-msg">아직 게시글이 없습니다.<br>첫 글을 남겨보세요!</div>';
            return;
        }

        snapshot.forEach(doc => {
            const post = doc.data();
            const postEl = document.createElement('div');
            postEl.className = 'feed-post';
            const formattedText = post.text ? post.text.replace(/\n/g, '<br>') : '';
            
            postEl.innerHTML = `
                <div class="feed-header">
                    <span class="no">no.${doc.id.substr(0, 4)}</span>
                    <span>${post.author || '익명'} | ${post.date}</span>
                </div>
                <img src="${post.imageUrl}" class="feed-img" alt="게시글 이미지" onerror="this.style.display='none'">
                <div class="feed-text">
                    ${formattedText}
                </div>
            `;
            feedArea.appendChild(postEl);
        });
    }, (error) => {
        console.error("Data Fetch Error:", error);
        // 권한 오류가 가장 흔함 (Firestore 규칙 확인 필요)
        if (error.code === 'permission-denied') {
             feedArea.innerHTML = '<div class="loading-msg">데이터 권한이 없습니다.<br>Firestore 규칙을 "Test Mode"로 설정했는지 확인하세요.</div>';
        } else {
             feedArea.innerHTML = '<div class="loading-msg">데이터를 불러오지 못했습니다.</div>';
        }
    });
}

// --- 초기화 실행 ---
initAuth();

// 인증 상태 변경 감지
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        console.log("Logged in as:", user.uid);
        subscribePosts(); 
    }
});

// --- 이벤트 리스너들 ---

// 관리자 로그인 UI 처리
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userid = document.getElementById('userid').value;
    const userpw = document.getElementById('userpw').value;

    if (userid === 'admin' && userpw === '1234') {
        alert('관리자님, 환영합니다! (일촌공개)');
        loginSection.classList.add('hidden');
        writeSection.classList.remove('hidden');
    } else {
        alert('비밀번호가 일치하지 않습니다.');
    }
});

// 로그아웃
document.getElementById('logout-btn').addEventListener('click', () => {
    loginSection.classList.remove('hidden');
    writeSection.classList.add('hidden');
    document.getElementById('userid').value = '';
    document.getElementById('userpw').value = '';
    previewArea.classList.add('hidden');
});

// 미리보기
previewBtn.addEventListener('click', () => {
    const imageUrl = document.getElementById('image-url').value;
    if (!imageUrl) {
        alert('이미지 URL을 입력해주세요.');
        return;
    }
    previewImg.src = imageUrl;
    previewArea.classList.remove('hidden');
});

// 등록 (Firestore 저장)
generateBtn.addEventListener('click', async () => {
    if (!currentUser) {
        alert('서버 연결 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    const author = document.getElementById('author').value || '익명';
    const text = document.getElementById('post-text').value;
    const imageUrl = document.getElementById('image-url').value;

    if (!text) {
        alert('내용을 입력해주세요.');
        return;
    }

    generateBtn.textContent = '저장 중...';
    generateBtn.disabled = true;

    try {
        // Firestore에 데이터 추가
        await addDoc(collection(db, 'posts'), {
            id: Date.now(), 
            text: text,
            author: author,
            imageUrl: imageUrl || 'https://via.placeholder.com/400x200?text=No+Image',
            date: new Date().toLocaleDateString()
        });

        alert('게시글이 등록되었습니다!');
        
        document.getElementById('post-text').value = '';
        document.getElementById('image-url').value = '';
        previewArea.classList.add('hidden');

    } catch (error) {
        console.error('Error saving post:', error);
        alert('저장에 실패했습니다. 콘솔을 확인하세요.');
    } finally {
        generateBtn.textContent = '등록';
        generateBtn.disabled = false;
    }
});
