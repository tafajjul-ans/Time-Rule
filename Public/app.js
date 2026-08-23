// ==========================================
// TIME & RULE - Main Application Architecture
// ==========================================

import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
const storage = getStorage();

import { auth, db, storage } from './config.js';
import { 
    onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
    signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, updateProfile,
    EmailAuthProvider, reauthenticateWithCredential, updatePassword, deleteUser 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    ref, set, get, update, remove, push, onValue, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
    ref as storageRef, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Global App State
let currentUser = null;
let userData = null;
let activeGroupId = null;
let activeGroupData = null;
let activeGroupRole = null;
let timerInterval = null;
let currentSettingsSubView = 'main';
let chatSessionActiveState = false;

// ==========================================
// 1. INITIALIZATION & ROUTING
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initAuthListeners();
    initNavigation();
    initConnectionMonitor();
    initGlobalSearch();
});

// Expose functions globally for ES module inline onclick handlers
window.openEditProfileModal = openEditProfileModal;
window.loadMyGroups = loadMyGroups;
window.openCreateGroupModal = openCreateGroupModal;
window.openJoinGroupModal = openJoinGroupModal;
window.navigateToSettingsSub = navigateToSettingsSub;
window.switchGroupSubTab = switchGroupSubTab;
window.joinGroup = joinGroup;
window.openGroupDetail = openGroupDetail;
window.submitAttendance = submitAttendance;
window.respondRequest = respondRequest;
window.respondTimetableRequest = respondTimetableRequest;
window.respondGroupInvite = respondGroupInvite;
window.castVote = castVote;
window.openTimetableActionModal = openTimetableActionModal;
window.viewUserProfile = viewUserProfile;
window.viewGroupDetails = viewGroupDetails;
window.openLightbox = openLightbox;
window.closeModal = closeModal;
window.switchAccountPrompt = switchAccountPrompt;
window.logoutUser = logoutUser;
window.toggleGroupOptionsMenu = toggleGroupOptionsMenu;
window.openEditGroupModal = openEditGroupModal;
window.promptCloseGroupTemporarily = promptCloseGroupTemporarily;
window.promptReactivateGroup = promptReactivateGroup;
window.confirmReactivateGroup = confirmReactivateGroup; // <-- Fixed: Exposed globally for modal click
window.promptDeleteGroupPermanently = promptDeleteGroupPermanently;
window.promptLeaveGroup = promptLeaveGroup;
window.openRegisterClearModal = openRegisterClearModal;
window.openAdminInviteModal = openAdminInviteModal;
window.inviteUserToGroup = inviteUserToGroup;
window.executeClearRegisterRange = executeClearRegisterRange;
window.toggleCustomRangeCard = toggleCustomRangeCard;

function showLoader() {
    document.getElementById('global-loader').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('global-loader').classList.add('hidden');
}

function initConnectionMonitor() {
    const connectedRef = ref(db, ".info/connected");
    const indicator = document.getElementById('connection-status');
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) indicator.className = "connection-pill online";
        else indicator.className = "connection-pill offline";
    });
}

function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-item, .mobile-nav-item');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.auth-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    document.getElementById('modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'modal-backdrop') closeModal();
    });

    document.getElementById('btn-open-create-group').addEventListener('click', () => openCreateGroupModal());
    document.getElementById('btn-open-join-group').addEventListener('click', () => openJoinGroupModal());
    document.getElementById('mark-all-read-btn').addEventListener('click', () => markAllNotificationsRead());

    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
        e.preventDefault();
        openForgotPasswordModal();
    });

    const regUsername = document.getElementById('reg-username');
    if (regUsername) {
        regUsername.addEventListener('input', debounce(async (e) => {
            const val = e.target.value.trim().toLowerCase();
            const statusEl = document.getElementById('username-status');
            const regex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
            if (!regex.test(val)) {
                statusEl.innerText = "Invalid format (3-20 chars, no spaces, starts with letter)";
                statusEl.className = "validation-feedback invalid";
                return;
            }
            const isAvailable = await checkUsernameUnique(val);
            if (isAvailable) {
                statusEl.innerText = "Username available!";
                statusEl.className = "validation-feedback valid";
            } else {
                statusEl.innerText = "Username already taken.";
                statusEl.className = "validation-feedback invalid";
            }
        }, 400));
    }
}

window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        btn.innerText = "Hide";
    } else {
        input.type = "password";
        btn.innerText = "Show";
    }
};

function switchTab(tabName) {
    if (!currentUser) {
        document.getElementById('main-app-view').classList.remove('active');
        document.getElementById('auth-view').classList.add('active');
        showToast("Please login or register first to access the app.", "warning");
        return;
    }

    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(b => {
        if (b.getAttribute('data-tab') === tabName) b.classList.add('active');
        else b.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.classList.add('active');

    const cornerAvatar = document.getElementById('topbar-corner-avatar');
    if (cornerAvatar) {
        if (tabName === 'settings') cornerAvatar.classList.add('hidden');
        else cornerAvatar.classList.remove('hidden');
    }

    const titles = { home: 'Dashboard', search: 'Search', groups: 'Groups', requests: 'Request Box', notifications: 'Notifications', settings: 'Settings' };
    document.getElementById('current-view-title').innerText = titles[tabName] || 'TIME & RULE';

    if (tabName === 'home') loadMyGroups();
    if (tabName === 'groups') loadMyGroups();
    if (tabName === 'requests') loadRequests();
    if (tabName === 'notifications') loadNotifications();
    if (tabName === 'settings') {
        currentSettingsSubView = 'main';
        renderSettingsView();
    }
}

// ==========================================
// 2. AUTHENTICATION & FORGOT PASSWORD
// ==========================================
function initAuthListeners() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            showLoader();
            await fetchUserData(user.uid);
            if (userData && userData.isDeactivated) {
                await update(ref(db, `users/${user.uid}`), { isDeactivated: false });
            }
            document.getElementById('auth-view').classList.remove('active');
            document.getElementById('main-app-view').classList.add('active');
            updateSidebarProfile();
            loadMyGroups();
            listenToBadges();
            startCentralTimeEngine();
            hideLoader();
        } else {
            currentUser = null;
            userData = null;
            if (timerInterval) clearInterval(timerInterval);
            document.getElementById('main-app-view').classList.remove('active');
            document.getElementById('auth-view').classList.add('active');
            hideLoader();
        }
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value;
        let email = identifier;

        showLoader();
        try {
            if (!identifier.includes('@')) {
                const uSnap = await get(ref(db, `usernames/${identifier.toLowerCase()}`));
                if (!uSnap.exists()) {
                    hideLoader();
                    showToast("Username not found. Please register first.", "danger");
                    return;
                }
                const uid = uSnap.val();
                const userSnap = await get(ref(db, `users/${uid}`));
                if (userSnap.exists()) email = userSnap.val().email;
            }
            await signInWithEmailAndPassword(auth, email, pass);
            hideLoader();
            showToast("Login successful!", "success");
        } catch (err) {
            hideLoader();
            showToast("Incorrect password. Please check your password and try again.", "danger");
        }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim().toLowerCase();
        const displayName = document.getElementById('reg-displayname').value.trim();
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;

        if (pass !== confirm) {
            showToast("Passwords do not match.", "warning");
            return;
        }

        const regex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
        if (!regex.test(username)) {
            showToast("Invalid username format.", "danger");
            return;
        }

        showLoader();
        const isAvailable = await checkUsernameUnique(username);
        if (!isAvailable) {
            hideLoader();
            showToast("Username is already taken.", "danger");
            return;
        }

        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(cred.user, { displayName });
            
            const uid = cred.user.uid;
            const photoURL = 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username;
            const userObj = {
                uid,
                username,
                displayName,
                email,
                photoURL,
                bio: 'Hey there! I am using TIME & RULE.',
                lastUsernameChange: Date.now(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await set(ref(db, `users/${uid}`), userObj);
            await set(ref(db, `usernames/${username}`), uid);

            hideLoader();
            showToast("Account registered and initialized!", "success");
        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });

    document.getElementById('google-login-btn').addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        showLoader();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const userRef = ref(db, `users/${user.uid}`);
            const snap = await get(userRef);

            if (!snap.exists()) {
                let baseUsername = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
                if (baseUsername.length < 3) baseUsername = 'user_' + Math.floor(Math.random() * 1000);
                let username = baseUsername;
                let counter = 1;
                while (!(await checkUsernameUnique(username))) {
                    username = `${baseUsername}_${counter++}`;
                }

                const userObj = {
                    uid: user.uid,
                    username,
                    displayName: user.displayName || username,
                    email: user.email,
                    photoURL: user.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username,
                    bio: 'Hey there! I am using TIME & RULE.',
                    lastUsernameChange: Date.now(),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                await set(userRef, userObj);
                await set(ref(db, `usernames/${username}`), user.uid);
            }
            hideLoader();
            showToast("Google authentication successful!", "success");
        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });
}

function openForgotPasswordModal() {
    openModal(`
        <div class="modal-header">
            <h3>Reset Password</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px;">Enter your registered username to receive a password reset link.</p>
        <div class="input-group">
            <label>Username</label>
            <input type="text" id="forgot-username-input" required placeholder="rahul_01">
        </div>
        <button type="button" id="send-reset-link-btn" class="futuristic-btn primary full-width">SEND RESET LINK</button>
    `);

    document.getElementById('send-reset-link-btn').addEventListener('click', async () => {
        const username = document.getElementById('forgot-username-input').value.trim().toLowerCase();
        if (!username) return;

        showLoader();
        try {
            const uSnap = await get(ref(db, `usernames/${username}`));
            if (!uSnap.exists()) {
                hideLoader();
                showToast("Username not found in system.", "danger");
                return;
            }
            const uid = uSnap.val();
            const userSnap = await get(ref(db, `users/${uid}`));
            if (!userSnap.exists()) {
                hideLoader();
                showToast("User account record missing.", "danger");
                return;
            }
                const email = userSnap.val().email;

    const actionCodeSettings = {
        url: 'https://time-rule.pages.dev/resetTemplate.html',
        handleCodeInApp: true,
    };
    await sendPasswordResetEmail(auth, email, actionCodeSettings);

    hideLoader();
    closeModal();
    showToast("Password reset link sent to your email.", "success");


        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });
}

async function fetchUserData(uid) {
    const snap = await get(ref(db, `users/${uid}`));
    if (snap.exists()) userData = snap.val();
}

async function checkUsernameUnique(username) {
    const snap = await get(ref(db, `usernames/${username}`));
    return !snap.exists();
}

function updateSidebarProfile() {
    if (!userData) return;
    document.getElementById('sidebar-user-name').innerText = userData.displayName;
    document.getElementById('sidebar-user-handle').innerText = `@${userData.username}`;
    const finalAvatar = userData.imageURL || userData.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${userData.username}`;
    document.getElementById('sidebar-user-avatar').src = finalAvatar;
    document.getElementById('topbar-corner-avatar').src = finalAvatar;

}

function logoutUser() {
    signOut(auth).then(() => {
        showToast("Logged out successfully.", "warning");
    });
}

function switchAccountPrompt() {
    signOut(auth).then(() => {
        showToast("Switched account. Please log in.", "warning");
    });
}

// ==========================================
// 3. LIGHTBOX & IMAGE CROPPER MODALS
// ==========================================
function openLightbox(url) {
    if (!url) return;
    openModal(`
        <div style="text-align:center;">
            <img src="${url}" style="max-width:100%; max-height:70vh; border-radius:16px; border:2px solid var(--accent-cyan); object-fit:contain;" alt="Profile Full">
            <button type="button" class="futuristic-btn secondary full-width" style="margin-top:16px;" onclick="closeModal()">Close</button>
        </div>
    `);
}

function openImageCropper(file, onCropped) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            openModal(`
                <div class="modal-header">
                    <h3>Crop Profile Photo</h3>
                    <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
                </div>
                <div style="text-align: center;">
                    <canvas id="crop-canvas" width="260" height="260" style="border:2px solid var(--accent-cyan); border-radius:12px; max-width:100%; cursor:crosshair;"></canvas>
                    <p style="font-size:12px; color:var(--text-muted); margin-top:8px;">Square crop area preview.</p>
                </div>
                <button type="button" id="confirm-crop-btn" class="futuristic-btn primary full-width" style="margin-top:16px;">CROP & APPLY</button>
            `);

            const canvas = document.getElementById('crop-canvas');
            const ctx = canvas.getContext('2d');
            let size = Math.min(img.width, img.height);
            let sx = (img.width - size) / 2;
            let sy = (img.height - size) / 2;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 260, 260);

            document.getElementById('confirm-crop-btn').onclick = () => {
                canvas.toBlob(async (blob) => {
                    closeModal();
                    try {
                        const auth = getAuth();
                        const user = auth.currentUser;
                        if (user) {
                            // 1. Firebase Storage par upload karein
                            const storageRef = ref(storage, 'profile_images/' + user.uid + '.jpg');
                            await uploadBytes(storageRef, blob);
                            // 2. Download URL nikalein
                            const downloadURL = await getDownloadURL(storageRef);
                            // 3. Database mein 'imageURL' update karein
                            const db = getDatabase();
                            await update(ref(db, 'users/' + user.uid), {
                                imageURL: downloadURL
                            });
                            // 4. Sidebar aur Topbar par turant photo dikhane ke liye
                            updateSidebarProfile();
                            showToast("Profile picture updated successfully!", "success");
                        }
                    } catch (error) {
                        console.error("Error uploading image: ", error);
                        showToast("Failed to update profile picture.", "error");
                    }
                }, 'image/jpeg', 0.9);

            };
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// 4. INCREMENTAL SEARCH & USER PROFILES
// ==========================================
function initGlobalSearch() {
    const searchInput = document.getElementById('global-search-input');
    if (!searchInput) return;

    let currentFilter = 'all';
    document.querySelectorAll('.search-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            executeGlobalSearch(searchInput.value.trim(), currentFilter);
        });
    });

    searchInput.addEventListener('input', debounce((e) => {
        executeGlobalSearch(e.target.value.trim(), currentFilter);
    }, 250));
}

async function executeGlobalSearch(queryStr, filter) {
    if (!currentUser) return;
    const container = document.getElementById('global-search-results');
    if (!queryStr) {
        container.innerHTML = '<div class="empty-state">Type username, exact group name or 10-digit Group ID to explore.</div>';
        return;
    }

    let html = '';
    const cleanQuery = queryStr.toLowerCase();

    if (filter === 'all' || filter === 'people') {
        const usersSnap = await get(ref(db, 'users'));
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const u = child.val();
                if (u.username.toLowerCase().includes(cleanQuery) || u.displayName.toLowerCase().includes(cleanQuery)) {
                    html += `
                        <div class="glass-card" onclick="viewUserProfile('${u.uid}')" style="display: flex; align-items: center; gap: 14px; padding: 14px; cursor: pointer;">
                            <img src="${u.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.username}" class="user-avatar-sm" alt="Avatar" onclick="event.stopPropagation(); openLightbox('${u.photoURL}')">
                            <div>
                                <h4>${u.displayName}</h4>
                                <p style="font-size: 12px; color: var(--accent-cyan);">@${u.username}</p>
                            </div>
                        </div>
                    `;
                }
            });
        }
    }

    if (filter === 'all' || filter === 'groups') {
        const groupsSnap = await get(ref(db, 'groups'));
        if (groupsSnap.exists()) {
            groupsSnap.forEach(child => {
                const g = child.val();
                const gId = child.key;
                if (!g.isClosed && (gId === queryStr || g.name.toLowerCase() === cleanQuery)) {
                    html += `
                        <div class="glass-card" onclick="viewGroupDetails('${gId}')" style="display: flex; justify-content: space-between; align-items: center; padding: 14px; cursor: pointer;">
                            <div>
                                <h4 style="color: var(--accent-purple);">${g.name}</h4>
                                <p style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan);">ID: ${gId}</p>
                                <p style="font-size: 12px; color: var(--text-muted); margin-top:2px;">${g.description || 'No description'}</p>
                            </div>
                            <button type="button" class="futuristic-btn small primary" onclick="event.stopPropagation(); joinGroup('${gId}')">Join</button>
                        </div>
                    `;
                }
            });
        }
    }

    container.innerHTML = html || '<div class="empty-state">No matching results found. Enter exact name or 10-digit Group ID.</div>';
}

async function viewUserProfile(uid) {
    if (!currentUser) return;
    showLoader();
    const snap = await get(ref(db, `users/${uid}`));
    hideLoader();
    if (!snap.exists()) return;
    const u = snap.val();

    const memSnap = await get(ref(db, `memberships/${uid}`));
    let groupListHtml = '';
    if (memSnap.exists()) {
        for (const gId of Object.keys(memSnap.val())) {
            const gSnap = await get(ref(db, `groups/${gId}`));
            if (gSnap.exists()) {
                const g = gSnap.val();
                if (!g.isClosed) {
                    groupListHtml += `<div style="font-size:12px; color:var(--accent-cyan); margin-top:4px;">• ${g.name} (ID: <code style="user-select:all; background:rgba(0,0,0,0.4); padding:2px 6px; border-radius:4px;">${gId}</code>)</div>`;
                }
            }
        }
    } else {
        groupListHtml = '<p style="font-size:12px; color:var(--text-muted);">No groups joined yet.</p>';
    }

    let inviteBtnHtml = '';
    if (activeGroupId && activeGroupRole === 'admin' && uid !== currentUser.uid) {
        const memberCheck = await get(ref(db, `groupMembers/${activeGroupId}/${uid}`));
        if (!memberCheck.exists()) {
            inviteBtnHtml = `<button type="button" class="futuristic-btn primary full-width" style="margin-top:12px;" onclick="inviteUserToGroup('${uid}', '${u.displayName}')">Invite to Group (${activeGroupData.name})</button>`;
        }
    }

    openModal(`
        <div class="modal-header">
            <h3>User Profile</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <div style="text-align:center; margin-bottom:16px;">
            <img src="${u.photoURL}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-cyan); cursor:pointer;" onclick="openLightbox('${u.photoURL}')">
            <h3 style="margin-top:10px;">${u.displayName}</h3>
            <p style="font-size:13px; color:var(--accent-cyan);">@${u.username}</p>
            <p style="font-size:13px; margin-top:6px; font-style:italic; color:var(--text-muted);">"${u.bio || 'No bio provided.'}"</p>
        </div>
        <hr style="border-color:rgba(255,255,255,0.1); margin:16px 0;">
        <h4>Joined Groups & IDs</h4>
        <div style="max-height:140px; overflow-y:auto; margin-top:8px;">
            ${groupListHtml}
        </div>
        ${inviteBtnHtml}
        <button type="button" class="futuristic-btn secondary full-width" style="margin-top:12px;" onclick="closeModal()">Close</button>
    `);
}

async function inviteUserToGroup(targetUid, targetName) {
    if (!currentUser || activeGroupRole !== 'admin') return;
    if (targetUid === currentUser.uid) {
        showToast("You cannot invite yourself to your own group.", "warning");
        return;
    }

    showLoader();
    const inviteRef = push(ref(db, `groupRequests/${activeGroupId}`));
    await set(inviteRef, {
        type: 'group_invite',
        groupId: activeGroupId,
        groupName: activeGroupData.name,
        adminUid: currentUser.uid,
        adminName: userData.displayName,
        targetUid,
        status: 'pending',
        createdAt: serverTimestamp()
    });

    await push(ref(db, `notifications/${targetUid}`), {
        title: `Group Invitation`,
        message: `${userData.displayName} invited you to join group "${activeGroupData.name}".`,
        read: false,
        timestamp: serverTimestamp()
    });

    hideLoader();
    closeModal();
    showToast(`Invite sent successfully to ${targetName}!`, "success");
}

function viewGroupDetails(groupId) {
    if (!currentUser) return;
    showLoader();
    get(ref(db, `groups/${groupId}`)).then(async (snap) => {
        hideLoader();
        if (!snap.exists()) return;
        const g = snap.val();
        if (g.isClosed) {
            showToast("This group is temporarily closed.", "warning");
            return;
        }

        const membersSnap = await get(ref(db, `groupMembers/${groupId}`));
        const memberCount = membersSnap.exists() ? Object.keys(membersSnap.val()).length : 1;

        openModal(`
            <div class="modal-header">
                <h3>Group Information</h3>
                <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
            </div>
            <div style="text-align:center; margin-bottom:16px;">
                <div style="width:64px; height:64px; border-radius:16px; background:linear-gradient(135deg,var(--accent-cyan),var(--accent-purple)); display:inline-flex; align-items:center; justify-content:center; font-size:28px; font-weight:700; color:#000;">${g.name.charAt(0)}</div>
                <h3 style="margin-top:10px;">${g.name}</h3>
                <p style="font-size:11px; font-family:var(--font-mono); color:var(--accent-cyan);">Group ID: ${groupId}</p>
            </div>
            <div class="glass-card" style="padding:16px; margin-bottom:16px;">
                <p style="font-size:13px; color:var(--text-muted);"><strong>Purpose & Description:</strong></p>
                <p style="font-size:13px; margin-top:6px;">${g.description || 'No description provided.'}</p>
                <p style="font-size:12px; margin-top:10px; font-family:var(--font-mono); color:var(--accent-success);">Total Members: ${memberCount}</p>
            </div>
            <div style="display:flex; gap:10px;">
                <button type="button" class="futuristic-btn secondary full-width" onclick="closeModal()">Close</button>
                <button type="button" class="futuristic-btn primary full-width" onclick="joinGroup('${groupId}'); closeModal();">Join Group</button>
            </div>
        `);
    });
}

// ==========================================
// 5. GROUPS, TEMPORARY CLOSE & RE-ACTIVE
// ==========================================
function openCreateGroupModal() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Create Group</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <form id="create-group-form" onsubmit="event.preventDefault();">
            <div class="input-group">
                <label>Group Name (Globally Unique)</label>
                <input type="text" id="new-group-name" required placeholder="Quantum Syndicate">
            </div>
            <div class="input-group">
                <label>Description & Purpose</label>
                <textarea id="new-group-desc" rows="3" required placeholder="Discipline and timetable governance group..."></textarea>
            </div>
            <button type="submit" id="create-grp-submit" class="futuristic-btn primary full-width">CREATE GROUP</button>
        </form>
    `);

    document.getElementById('create-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-group-name').value.trim();
        const description = document.getElementById('new-group-desc').value.trim();
        const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

        showLoader();
        const groupNameRef = ref(db, `groupNames/${normalizedName}`);
        const nameSnap = await get(groupNameRef);
        if (nameSnap.exists()) {
            hideLoader();
            showToast("Group name already taken. Choose another.", "danger");
            return;
        }

        const groupId = Math.floor(1000000000 + Math.random() * 9000000000).toString();

        const groupData = {
            groupId,
            name,
            normalizedName,
            description,
            adminUid: currentUser.uid,
            isClosed: false,
            createdAt: serverTimestamp()
        };

        try {
            await set(groupNameRef, groupId);
            await set(ref(db, `groups/${groupId}`), groupData);
            await set(ref(db, `memberships/${currentUser.uid}/${groupId}`), 'admin');
            await set(ref(db, `groupMembers/${groupId}/${currentUser.uid}`), {
                uid: currentUser.uid,
                role: 'admin',
                joinedAt: serverTimestamp()
            });

            hideLoader();
            closeModal();
            showToast(`Group created! ID: ${groupId}`, "success");
            loadMyGroups();
        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });
}

function openJoinGroupModal() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Join Group</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <div class="input-group">
            <label>Search Group by Name or 10-digit ID</label>
            <input type="text" id="group-search-input" placeholder="Type exact name or 10-digit Group ID...">
        </div>
        <div id="group-search-results" class="vertical-stack" style="max-height: 250px; overflow-y: auto;"></div>
    `);

    const searchInput = document.getElementById('group-search-input');
    searchInput.addEventListener('input', debounce(async (e) => {
        const queryStr = e.target.value.trim().toLowerCase();
        const container = document.getElementById('group-search-results');
        if (!queryStr) { container.innerHTML = ''; return; }

        const snap = await get(ref(db, 'groups'));
        if (!snap.exists()) { container.innerHTML = '<div class="empty-state">No groups found</div>'; return; }

        let html = '';
        snap.forEach(child => {
            const grp = child.val();
            const gId = child.key;
            if (!grp.isClosed && (gId === queryStr || grp.name.toLowerCase() === queryStr)) {
                html += `
                    <div class="glass-card" style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${grp.name}</strong>
                            <p style="font-size: 11px; font-family: var(--font-mono); color: var(--accent-cyan);">ID: ${gId}</p>
                        </div>
                        <button type="button" class="futuristic-btn small primary" onclick="joinGroup('${gId}')">Join</button>
                    </div>
                `;
            }
        });
        container.innerHTML = html || '<div class="empty-state">No matching active groups</div>';
    }, 300));
}

async function joinGroup(groupId) {
    if (!currentUser) return;
    showLoader();
    const memCheckRef = ref(db, `memberships/${currentUser.uid}/${groupId}`);
    const snap = await get(memCheckRef);
    if (snap.exists()) {
        hideLoader();
        closeModal();
        showToast("You have already joined this group!", "warning");
        return;
    }

    set(memCheckRef, 'member').then(async () => {
        await set(ref(db, `groupMembers/${groupId}/${currentUser.uid}`), {
            uid: currentUser.uid,
            role: 'member',
            joinedAt: serverTimestamp()
        });
        hideLoader();
        closeModal();
        showToast("Successfully joined group!", "success");
        loadMyGroups();
    }).catch(err => {
        hideLoader();
        showToast(err.message, "danger");
    });
}

function loadMyGroups() {
    if (!currentUser) return;
    const container = document.getElementById('my-groups-list');
    const groupsTabContainer = document.getElementById('tab-groups');

    if (groupsTabContainer && groupsTabContainer.classList.contains('active')) {
        groupsTabContainer.innerHTML = `
            <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>Groups</h3>
                <button type="button" class="futuristic-btn small primary" onclick="openCreateGroupModal()">+ Create Group</button>
            </div>
            <div id="groups-list-grid" class="cards-grid"></div>
        `;
    }

    const targetContainer = document.getElementById('groups-list-grid') || container;
    if (!targetContainer) return;

    showLoader();
    get(ref(db, `memberships/${currentUser.uid}`)).then(async (membershipsSnap) => {
        hideLoader();
        if (!membershipsSnap.exists()) {
            targetContainer.innerHTML = '<div class="empty-state">No groups joined yet. Create or join one.</div>';
            return;
        }

        let html = '';
        const groupIds = Object.keys(membershipsSnap.val());
        for (const groupId of groupIds) {
            const grpSnap = await get(ref(db, `groups/${groupId}`));
            if (grpSnap.exists()) {
                const grp = grpSnap.val();
                const membersSnap = await get(ref(db, `groupMembers/${groupId}`));
                const memberCount = membersSnap.exists() ? Object.keys(membersSnap.val()).length : 1;
                const role = membershipsSnap.val()[groupId];

                const isClosed = grp.isClosed === true;
                const cardStyle = isClosed ? 'filter: grayscale(100%); opacity: 0.65; border-color: rgba(255,255,255,0.1);' : '';

                html += `
                    <div class="group-card" style="${cardStyle}" onclick="openGroupDetail('${groupId}')">
                        <div class="group-card-header">
                            <div class="group-avatar-sm">${grp.name.charAt(0).toUpperCase()}</div>
                            <div class="group-card-info">
                                <h4>${grp.name} ${isClosed ? '🔒 [CLOSED]' : ''}</h4>
                                <p>Role: ${role.toUpperCase()}</p>
                            </div>
                        </div>
                        <div class="group-card-body">
                            <p>${grp.description || 'No description provided.'}</p>
                        </div>
                        <div class="group-card-footer">
                            <span>Members: ${memberCount} | ID: <code style="user-select:all;">${groupId}</code></span>
                            <span style="color: ${isClosed ? 'var(--text-muted)' : 'var(--accent-cyan);'};">${isClosed ? 'Closed' : 'Dashboard →'}</span>
                        </div>
                    </div>
                `;
            }
        }
        targetContainer.innerHTML = html || '<div class="empty-state">No active groups.</div>';
    });
}

function openGroupDetail(groupId) {
    if (!currentUser) return;
    activeGroupId = groupId;
    showLoader();
    get(ref(db, `groups/${groupId}`)).then(async (grpSnap) => {
        hideLoader();
        activeGroupData = grpSnap.val();
        const memSnap = await get(ref(db, `memberships/${currentUser.uid}/${groupId}`));
        activeGroupRole = memSnap.val() || 'member';

        if (activeGroupData.isClosed) {
            if (activeGroupRole === 'admin') {
                promptReactivateGroup(groupId);
            } else {
                showToast("This group is temporarily closed by the admin.", "warning");
            }
            return;
        }

        switchTab('groups');
        renderGroupDashboardContainer();
    });
}

function promptReactivateGroup(groupId) {
    openModal(`
        <div class="modal-header">
            <h3>Temporarily Closed Group</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">This group (${activeGroupData.name}) is currently closed and hidden from general views. As an admin, what would you like to do?</p>
        <div style="display:flex; flex-direction:column; gap:10px;">
            <button type="button" class="futuristic-btn primary full-width" onclick="confirmReactivateGroup('${groupId}')">Re-Active Group</button>
            <button type="button" class="futuristic-btn danger full-width" onclick="promptDeleteGroupPermanently()">Delete Permanently</button>
            <button type="button" class="futuristic-btn secondary full-width" onclick="closeModal(); loadMyGroups();">Back</button>
        </div>
    `);
}

function confirmReactivateGroup(groupId) {
    openModal(`
        <div class="modal-header">
            <h3>Confirm Re-activation</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Are you sure you want to re-activate this group and make it fully accessible again?</p>
        <div style="display:flex; gap:10px;">
            <button type="button" class="futuristic-btn secondary full-width" onclick="promptReactivateGroup('${groupId}')">Cancel</button>
            <button type="button" class="futuristic-btn primary full-width" id="exec-reactivate-btn">Confirm Re-Active</button>
        </div>
    `);

    document.getElementById('exec-reactivate-btn').onclick = async () => {
        showLoader();
        await update(ref(db, `groups/${groupId}`), { isClosed: false });
        activeGroupData.isClosed = false;
        hideLoader();
        closeModal();
        showToast("Group re-activated successfully!", "success");
        switchTab('groups');
        renderGroupDashboardContainer();
    };
}

function renderGroupDashboardContainer() {
    if (!currentUser) return;
    const container = document.getElementById('tab-groups');
    const isAdmin = activeGroupRole === 'admin';

    container.innerHTML = `
        <div class="group-dashboard-header">
            <div class="group-title-row">
                <div class="group-big-avatar">${activeGroupData.name.charAt(0).toUpperCase()}</div>
                <div>
                    <h2>${activeGroupData.name}</h2>
                    <p style="color: var(--accent-cyan); font-size: 11px; font-family: var(--font-mono);">Group ID: ${activeGroupId}</p>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                ${isAdmin ? `
                    <div class="group-options-wrapper">
                        <button type="button" class="group-three-dots-btn" onclick="toggleGroupOptionsMenu(event)">⋮</button>
                        <div class="group-options-dropdown">
                            <div class="group-dropdown-item" onclick="openEditGroupModal()">✏️ Edit Group Info</div>
                            <div class="group-dropdown-item" onclick="promptCloseGroupTemporarily()">🔒 Close Temporarily</div>
                            <div class="group-dropdown-item danger" onclick="promptDeleteGroupPermanently()">⚠️ Delete Permanently</div>
                        </div>
                    </div>
                ` : `
                    <div class="group-options-wrapper">
                        <button type="button" class="group-three-dots-btn" onclick="toggleGroupOptionsMenu(event)">⋮</button>
                        <div class="group-options-dropdown">
                            <div class="group-dropdown-item danger" onclick="promptLeaveGroup()">🚪 Leave Group</div>
                        </div>
                    </div>
                `}
                <button type="button" class="futuristic-btn secondary small" onclick="loadMyGroups()">← Back</button>
            </div>
        </div>

        <div class="group-nav-tabs">
            <button type="button" class="group-sub-tab active" data-sub="overview" onclick="switchGroupSubTab('overview')">Overview</button>
            <button type="button" class="group-sub-tab" data-sub="timetable" onclick="switchGroupSubTab('timetable')">Timetable</button>
            <button type="button" class="group-sub-tab" data-sub="register" onclick="switchGroupSubTab('register')">📖 Register Notes</button>
            <button type="button" class="group-sub-tab" data-sub="chat" onclick="switchGroupSubTab('chat')">Group Chat</button>
            <button type="button" class="group-sub-tab" data-sub="members" onclick="switchGroupSubTab('members')">Members</button>
        </div>

        <div id="group-subtab-content"></div>
    `;
    switchGroupSubTab('overview');
}

function toggleGroupOptionsMenu(e) {
    e.stopPropagation();
    document.querySelectorAll('.group-options-dropdown').forEach(d => {
        if (d !== e.currentTarget.nextElementSibling) d.classList.remove('show');
    });
    const dropdown = e.currentTarget.nextElementSibling;
    if (dropdown) dropdown.classList.toggle('show');
}

window.addEventListener('click', () => {
    document.querySelectorAll('.group-options-dropdown').forEach(d => d.classList.remove('show'));
});

function openEditGroupModal() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Edit Group Details</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <form id="edit-group-form" onsubmit="event.preventDefault();">
            <div class="input-group">
                <label>Group Name</label>
                <input type="text" id="edit-grp-name" required value="${activeGroupData.name}">
            </div>
            <div class="input-group">
                <label>Description & Purpose</label>
                <textarea id="edit-grp-desc" rows="3">${activeGroupData.description || ''}</textarea>
            </div>
            <button type="submit" id="edit-grp-submit" class="futuristic-btn primary full-width">SAVE CHANGES</button>
        </form>
    `);

    document.getElementById('edit-group-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('edit-grp-name').value.trim();
        const description = document.getElementById('edit-grp-desc').value.trim();

        showLoader();
        await update(ref(db, `groups/${activeGroupId}`), { name, description });
        activeGroupData.name = name;
        activeGroupData.description = description;
        hideLoader();
        closeModal();
        showToast("Saved changes successfully!", "success");
        renderGroupDashboardContainer();
    });
}

function promptCloseGroupTemporarily() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Close Group Temporarily</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">This will temporarily mark the group with low saturation (grayscale) and restrict access. Only you (admin) can re-activate it.</p>
        <button type="button" id="confirm-close-grp" class="futuristic-btn danger full-width">CONFIRM CLOSE GROUP</button>
    `);

    document.getElementById('confirm-close-grp').addEventListener('click', async () => {
        showLoader();
        await update(ref(db, `groups/${activeGroupId}`), { isClosed: true });
        activeGroupData.isClosed = true;
        hideLoader();
        closeModal();
        showToast("Group closed temporarily.", "warning");
        loadMyGroups();
    });
}

function promptLeaveGroup() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Leave Group</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Are you sure you want to exit this group?</p>
        <button type="button" id="confirm-leave-grp" class="futuristic-btn danger full-width">LEAVE GROUP</button>
    `);

    document.getElementById('confirm-leave-grp').addEventListener('click', async () => {
        showLoader();
        try {
            await remove(ref(db, `memberships/${currentUser.uid}/${activeGroupId}`));
            await remove(ref(db, `groupMembers/${activeGroupId}/${currentUser.uid}`));
            hideLoader();
            closeModal();
            showToast("You have left the group.", "warning");
            loadMyGroups();
        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });
}

function promptDeleteGroupPermanently() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Delete Group Permanently</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--accent-danger); margin-bottom:16px;">Warning: This action is irreversible. All members, records, timetables, and database data will be wiped.</p>
        <button type="button" id="confirm-delete-grp" class="futuristic-btn danger full-width">DELETE PERMANENTLY</button>
    `);

    document.getElementById('confirm-delete-grp').addEventListener('click', async () => {
        showLoader();
        try {
            const membersSnap = await get(ref(db, `groupMembers/${activeGroupId}`));
            if (membersSnap.exists()) {
                const memberUids = Object.keys(membersSnap.val());
                for (const uid of memberUids) {
                    await remove(ref(db, `memberships/${uid}/${activeGroupId}`));
                }
            }
            if (activeGroupData && activeGroupData.normalizedName) {
                await remove(ref(db, `groupNames/${activeGroupData.normalizedName}`));
            }
            await remove(ref(db, `groups/${activeGroupId}`));
            await remove(ref(db, `groupMembers/${activeGroupId}`));
            await remove(ref(db, `timetables/${activeGroupId}`));
            await remove(ref(db, `messages/${activeGroupId}`));
            await remove(ref(db, `groupRequests/${activeGroupId}`));
            await remove(ref(db, `attendance/${activeGroupId}`));

            hideLoader();
            closeModal();
            showToast("Group and all associated data deleted permanently.", "success");
            loadMyGroups();
        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });
}

function switchGroupSubTab(subtab) {
    if (!currentUser) return;
    document.querySelectorAll('.group-sub-tab').forEach(b => {
        if (b.getAttribute('data-sub') === subtab) b.classList.add('active');
        else b.classList.remove('active');
    });

    const contentArea = document.getElementById('group-subtab-content');
    if (subtab === 'overview') renderGroupOverview(contentArea);
    if (subtab === 'timetable') renderGroupTimetable(contentArea);
    if (subtab === 'register') renderGroupRegister(contentArea);
    if (subtab === 'chat') renderGroupChat(contentArea);
    if (subtab === 'members') renderGroupMembers(contentArea);
}

function renderGroupOverview(container) {
    container.innerHTML = `
        <div class="live-activity-card">
            <div>
                <span class="live-badge">SYSTEM STATUS: ACTIVE</span>
                <h3 id="current-active-title" style="margin-top: 8px;">Loading current activity...</h3>
                <p id="current-active-timing" style="font-size: 13px; color: var(--text-muted);">Checking timetable state...</p>
            </div>
            <div id="live-action-widget"></div>
        </div>
        <div class="glass-card">
            <h4>Group Governance & Rules</h4>
            <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">
                ${activeGroupData.description || 'No description provided.'}
            </p>
        </div>
    `;
    checkCurrentTimetableState();
}

function renderGroupTimetable(container) {
    container.innerHTML = `
        <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3>Group Timetable</h3>
            ${activeGroupRole === 'admin' ? '<button type="button" class="futuristic-btn small primary" onclick="openCreateTimetableModal()">+ Add Timetable Item</button>' : ''}
        </div>
        <div id="timetable-items-list" class="vertical-stack"></div>
    `;
    loadTimetableItems();
}

async function loadTimetableItems() {
    if (!currentUser) return;
    const listEl = document.getElementById('timetable-items-list');
    if (!listEl) return;

    const snap = await get(ref(db, `timetables/${activeGroupId}`));
    if (!snap.exists()) {
        listEl.innerHTML = '<div class="empty-state">No timetable items configured yet.</div>';
        return;
    }

    let html = '';
    snap.forEach(child => {
        const item = child.val();
        const tId = child.key;
        html += `
            <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="color: var(--accent-cyan);">${item.title} (${item.activityType || 'Study'})</h4>
                    <p style="font-size: 13px; color: var(--text-muted);">Time: ${item.startTime} → ${item.endTime}</p>
                    <p style="font-size: 12px; margin-top: 4px;">${item.description || ''}</p>
                </div>
                ${activeGroupRole === 'admin' ? `
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="futuristic-btn small secondary" onclick="openTimetableActionModal('edit', '${tId}', '${item.title}', '${item.startTime}', '${item.endTime}', '${item.description || ''}')">Edit</button>
                        <button type="button" class="futuristic-btn small danger" onclick="openTimetableActionModal('delete', '${tId}')">Delete</button>
                    </div>
                ` : ''}
            </div>
        `;
    });
    listEl.innerHTML = html;
}

// ==========================================
// 6. REGISTER COPY & RECORD CLEARING (CUSTOM CARD UI)
// ==========================================
async function renderGroupRegister(container) {
    if (!currentUser) return;
    showLoader();

    const membersSnap = await get(ref(db, `groupMembers/${activeGroupId}`));
    const timetablesSnap = await get(ref(db, `timetables/${activeGroupId}`));
    const attendanceSnap = await get(ref(db, `attendance/${activeGroupId}`));
    
    hideLoader();

    if (!membersSnap.exists()) {
        container.innerHTML = '<div class="empty-state">No members found in this group.</div>';
        return;
    }

    const membersData = membersSnap.val();
    const timetablesData = timetablesSnap.exists() ? timetablesSnap.val() : {};
    const attendanceData = attendanceSnap.exists() ? attendanceSnap.val() : {};

    let dates = Object.keys(attendanceData).sort().reverse();
    if (dates.length === 0) {
        dates = [new Date().toISOString().split('T')[0]];
    }

    let sessionColumns = [];
    for (const date of dates) {
        for (const [tId, tItem] of Object.entries(timetablesData)) {
            sessionColumns.push({
                date: date,
                timetableId: tId,
                title: tItem.title || 'Session',
                time: `${tItem.startTime} - ${tItem.endTime}`
            });
        }
    }

    if (sessionColumns.length === 0) {
        for (const date of dates) {
            sessionColumns.push({ date: date, timetableId: 'general', title: 'General Session', time: '' });
        }
    }

    let html = `
        <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3>📖 Digital Register</h3>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">P = Present | A = Absent | Cleared = Cleared</span>
                ${activeGroupRole === 'admin' ? `
                    <div class="group-options-wrapper" style="display:inline-block; position:relative;">
                        <button type="button" class="group-three-dots-btn" onclick="toggleGroupOptionsMenu(event)">⋮</button>
                        <div class="group-options-dropdown">
                            <div class="group-dropdown-item" onclick="openRegisterClearModal()">🧹 Clear Register Records</div>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="register-container">
            <table class="register-table">
                <thead>
                    <tr>
                        <th>Member Name</th>
                        <th>Username</th>
                        ${sessionColumns.map(col => `<th>📅 ${col.date}<br><span style="font-size:10px; color:var(--accent-cyan); font-weight:normal;">${col.title} (${col.time})</span></th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    for (const mId of Object.keys(membersData)) {
        const uSnap = await get(ref(db, `users/${mId}`));
        const uInfo = uSnap.exists() ? uSnap.val() : { displayName: 'Member', username: 'user' };

        html += `
            <tr>
                <td><strong>${uInfo.displayName}</strong></td>
                <td style="color: var(--accent-cyan);">@${uInfo.username}</td>
        `;

        for (const col of sessionColumns) {
            const dateRecord = attendanceData[col.date] || {};
            const sessionRecord = dateRecord[col.timetableId] || {};
            const userAttendance = sessionRecord[mId];

            if (sessionRecord._cleared === true) {
                html += `<td><span style="display:inline-block; padding:4px 8px; border-radius:6px; background:rgba(255,179,0,0.15); color:var(--accent-warning); font-weight:700;">Cleared</span></td>`;
            } else if (dateRecord[col.timetableId] !== undefined) {
                if (userAttendance) {
                    html += `<td><span class="attendance-badge-p">P</span></td>`;
                } else {
                    html += `<td><span class="attendance-badge-a">A</span></td>`;
                }
            } else {
                html += `<td><span class="attendance-badge-none">-</span></td>`;
            }
        }

        html += `</tr>`;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function openRegisterClearModal() {
    if (!currentUser || activeGroupRole !== 'admin') return;
    openModal(`
        <div class="modal-header">
            <h3>🧹 Clear Register Records</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Select timeframe to clear records and mark as 'Cleared':</p>
        
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
            <div class="glass-card" style="padding:14px; cursor:pointer; border-color:var(--border-glass);" onclick="executeClearRegisterRange('day')">
                <h4 style="color:var(--accent-cyan); font-size:15px;">📅 This Day (Today)</h4>
                <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Clear records for today's sessions.</p>
            </div>
            <div class="glass-card" style="padding:14px; cursor:pointer; border-color:var(--border-glass);" onclick="executeClearRegisterRange('week')">
                <h4 style="color:var(--accent-cyan); font-size:15px;">📅 This Week (Last 7 Days)</h4>
                <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Clear records for the past week.</p>
            </div>
            <div class="glass-card" style="padding:14px; cursor:pointer; border-color:var(--border-glass);" onclick="executeClearRegisterRange('month')">
                <h4 style="color:var(--accent-cyan); font-size:15px;">📅 This Month (Last 30 Days)</h4>
                <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Clear records for the past month.</p>
            </div>
            <div class="glass-card" style="padding:14px; cursor:pointer; border-color:var(--border-glass);" onclick="toggleCustomRangeCard()">
                <h4 style="color:var(--accent-purple); font-size:15px;">📅 Select Date to Date (Custom)</h4>
                <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Specify custom start and end dates.</p>
            </div>
        </div>

        <div id="custom-range-card" class="glass-card hidden" style="padding:16px; margin-bottom:16px; border-color:var(--accent-cyan);">
            <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                <div class="input-group" style="flex:1;"><label>From Date</label><input type="date" id="clear-from-date"></div>
                <div class="input-group" style="flex:1;"><label>To Date</label><input type="date" id="clear-to-date"></div>
            </div>
            <button type="button" class="futuristic-btn primary full-width" onclick="executeClearRegisterRange('custom')">Confirm & Clear Range</button>
        </div>

        <button type="button" class="futuristic-btn secondary full-width" onclick="closeModal()">Cancel</button>
    `);
}

function toggleCustomRangeCard() {
    const card = document.getElementById('custom-range-card');
    if (card) card.classList.toggle('hidden');
}

async function executeClearRegisterRange(range) {
    const attendanceRef = ref(db, `attendance/${activeGroupId}`);
    showLoader();

    const snap = await get(attendanceRef);
    if (!snap.exists()) {
        hideLoader();
        closeModal();
        showToast("No attendance records found to clear.", "warning");
        return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const attendanceData = snap.val();

    let fromStr = '';
    let toStr = todayStr;

    if (range === 'day') {
        fromStr = todayStr;
    } else if (range === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        fromStr = d.toISOString().split('T')[0];
    } else if (range === 'month') {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        fromStr = d.toISOString().split('T')[0];
    } else if (range === 'custom') {
        fromStr = document.getElementById('clear-from-date').value;
        toStr = document.getElementById('clear-to-date').value;
        if (!fromStr || !toStr) {
            hideLoader();
            showToast("Please select valid dates.", "warning");
            return;
        }
    }

    const updates = {};
    for (const [dateKey, dateObj] of Object.entries(attendanceData)) {
        if (dateKey >= fromStr && dateKey <= toStr) {
            for (const timetableKey of Object.keys(dateObj)) {
                updates[`${dateKey}/${timetableKey}/_cleared`] = true;
            }
        }
    }

    await update(attendanceRef, updates);
    hideLoader();
    closeModal();
    showToast("Records cleared successfully with 'Cleared' status indicator.", "success");
    renderGroupRegister(document.getElementById('group-subtab-content'));
}

window.openCreateTimetableModal = function() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Create Timetable Activity</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <form id="timetable-form" onsubmit="event.preventDefault();">
            <div class="input-group">
                <label>Title</label>
                <input type="text" id="tt-title" required placeholder="Study Time">
            </div>
            <div class="input-group">
                <label>Activity Type</label>
                <select id="tt-type">
                    <option value="Study">Study</option>
                    <option value="Discussion">Discussion Time</option>
                    <option value="Exercise">Exercise</option>
                    <option value="Work">Work</option>
                </select>
            </div>
            <div style="display: flex; gap: 10px;">
                <div class="input-group" style="flex:1;">
                    <label>Start Time (HH:MM 24h)</label>
                    <input type="text" id="tt-start-input" required placeholder="08:00" value="08:00">
                </div>
                <div class="input-group" style="flex:1;">
                    <label>End Time (HH:MM 24h)</label>
                    <input type="text" id="tt-end-input" required placeholder="10:00" value="10:00">
                </div>
            </div>
            <div class="input-group">
                <label>Description & Purpose</label>
                <textarea id="tt-desc" placeholder="Details about this timetable slot..."></textarea>
            </div>
            <button type="submit" id="tt-save-btn" class="futuristic-btn primary full-width">SAVE TIMETABLE ITEM</button>
        </form>
    `);

    document.getElementById('timetable-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('tt-title').value.trim();
        const activityType = document.getElementById('tt-type').value;
        const startTime = document.getElementById('tt-start-input').value.trim();
        const endTime = document.getElementById('tt-end-input').value.trim();
        const description = document.getElementById('tt-desc').value.trim();

        if (!startTime || !endTime) {
            showToast("Please enter valid start and end times.", "warning");
            return;
        }

        showLoader();
        const newRef = push(ref(db, `timetables/${activeGroupId}`));
        await set(newRef, { title, activityType, startTime, endTime, description, createdAt: serverTimestamp() });
        hideLoader();
        closeModal();
        showToast("Timetable item created successfully.", "success");
        loadTimetableItems();
    });
};

function openTimetableActionModal(action, timetableId, curTitle='', curStart='', curEnd='', curDesc='') {
    openModal(`
        <div class="modal-header">
            <h3>${action === 'edit' ? 'Propose Timetable Edit' : 'Propose Timetable Deletion'}</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">State the purpose for this ${action}. This will be sent to all members for strict agreement.</p>
        
        ${action === 'edit' ? `
            <div class="input-group"><label>Title</label><input type="text" id="edit-tt-title" value="${curTitle}"></div>
            <div style="display:flex; gap:10px;">
                <div class="input-group" style="flex:1;"><label>Start Time (HH:MM)</label><input type="text" id="edit-tt-start" value="${curStart}"></div>
                <div class="input-group" style="flex:1;"><label>End Time (HH:MM)</label><input type="text" id="edit-tt-end" value="${curEnd}"></div>
            </div>
            <div class="input-group"><label>Description</label><textarea id="edit-tt-desc">${curDesc}</textarea></div>
        ` : ''}

        <div class="input-group">
            <label>Purpose / Reason *</label>
            <textarea id="tt-action-purpose" rows="3" required placeholder="Why are you modifying or deleting this slot?"></textarea>
        </div>
        <button type="button" id="submit-tt-request-btn" class="futuristic-btn primary full-width">SUBMIT PROPOSAL FOR AGREEMENT</button>
    `);

    document.getElementById('submit-tt-request-btn').onclick = async () => {
        const purpose = document.getElementById('tt-action-purpose').value.trim();
        if (!purpose) {
            showToast("Please provide a purpose.", "warning");
            return;
        }

        let updatedData = {};
        if (action === 'edit') {
            updatedData = {
                title: document.getElementById('edit-tt-title').value,
                startTime: document.getElementById('edit-tt-start').value,
                endTime: document.getElementById('edit-tt-end').value,
                description: document.getElementById('edit-tt-desc').value
            };
        }

        showLoader();
        const membersSnap = await get(ref(db, `groupMembers/${activeGroupId}`));
        const members = membersSnap.exists() ? Object.keys(membersSnap.val()) : [currentUser.uid];

        const reqRef = push(ref(db, `groupRequests/${activeGroupId}`));
        await set(reqRef, {
            type: 'timetable_modification',
            action,
            timetableId,
            adminUid: currentUser.uid,
            purpose,
            updatedData,
            status: 'pending',
            agreedUids: [currentUser.uid],
            disagreedUids: [],
            requiredUids: members,
            createdAt: serverTimestamp()
        });

        for (const mUid of members) {
            if (mUid !== currentUser.uid) {
                await push(ref(db, `notifications/${mUid}`), {
                    title: `Timetable ${action.toUpperCase()} Proposal`,
                    message: `Admin proposed to ${action} timetable item. Purpose: ${purpose}`,
                    read: false,
                    timestamp: serverTimestamp()
                });
            }
        }

        hideLoader();
        closeModal();
        showToast("Proposal sent to all members for agreement.", "success");
    };
}

function startCentralTimeEngine() {
    timerInterval = setInterval(() => {
        if (currentUser && activeGroupId) checkCurrentTimetableState();
    }, 10000);
}

async function checkCurrentTimetableState() {
    if (!currentUser || !activeGroupId) return;
    const titleEl = document.getElementById('current-active-title');
    const timingEl = document.getElementById('current-active-timing');
    const actionEl = document.getElementById('live-action-widget');

    if (!titleEl) return;

    const snap = await get(ref(db, `timetables/${activeGroupId}`));
    if (!snap.exists()) {
        titleEl.innerText = "No active timetable items";
        timingEl.innerText = "Configure timetables to begin.";
        chatSessionActiveState = false;
        return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayStr = now.toISOString().split('T')[0];

    let foundActive = false;
    let anyAttendanceOpen = false;

    snap.forEach(child => {
        const item = child.val();
        const [startH, startM] = (item.startTime || "00:00").split(':').map(Number);
        const [endH, endM] = (item.endTime || "00:00").split(':').map(Number);
        const startTotalM = startH * 60 + startM;
        const endTotalM = endH * 60 + endM;

        if (currentMinutes >= startTotalM && currentMinutes <= endTotalM) {
            foundActive = true;
            const presentationWindowEnd = startTotalM + 10;
            const isPresentationOpen = currentMinutes <= presentationWindowEnd;
            if (isPresentationOpen) anyAttendanceOpen = true;

            titleEl.innerText = `${item.title} (${item.activityType})`;
            timingEl.innerText = `Active from ${item.startTime} → ${item.endTime} | Presentation: ${isPresentationOpen ? 'OPEN' : 'CLOSED'}`;

            if (isPresentationOpen) {
                actionEl.innerHTML = `<button type="button" class="futuristic-btn primary" onclick="submitAttendance('${child.key}', '${todayStr}')">SUBMIT PRESENT</button>`;
            } else {
                actionEl.innerHTML = `<span class="badge" style="background:var(--accent-warning); color:#000;">PRESENTATION CLOSED</span>`;
            }
        }
    });

    chatSessionActiveState = anyAttendanceOpen;
    if (!anyAttendanceOpen) {
        remove(ref(db, `messages/${activeGroupId}`));
    }

    if (!foundActive) {
        titleEl.innerText = "No Active Timetable Slot Right Now";
        timingEl.innerText = "Check schedule for upcoming sessions.";
        if (actionEl) actionEl.innerHTML = '';
    }
}

function submitAttendance(timetableId, dateStr) {
    if (!currentUser) return;
    showLoader();
    const attendanceRef = ref(db, `attendance/${activeGroupId}/${dateStr}/${timetableId}/${currentUser.uid}`);
    set(attendanceRef, {
        uid: currentUser.uid,
        status: 'pending',
        timestamp: serverTimestamp()
    }).then(() => {
        hideLoader();
        showToast("Presentation attendance submitted!", "success");
    });
}

// ==========================================
// 7. REQUESTS, INVITES & VOTING
// ==========================================
async function loadRequests() {
    if (!currentUser) return;
    const container = document.getElementById('requests-list');
    if (!container) return;

    showLoader();
    const membershipsSnap = await get(ref(db, `memberships/${currentUser.uid}`));
    hideLoader();

    let html = '';

    const groupsSnap = await get(ref(db, 'groups'));
    if (groupsSnap.exists()) {
        for (const gChild of Object.values(groupsSnap.val())) {
            const gId = gChild.groupId;
            const reqSnap = await get(ref(db, `groupRequests/${gId}`));
            if (reqSnap.exists()) {
                reqSnap.forEach(child => {
                    const req = child.val();
                    const reqId = child.key;
                    if (req.type === 'group_invite' && req.targetUid === currentUser.uid && req.status === 'pending') {
                        html += `
                            <div class="glass-card" style="border: 1px solid var(--accent-cyan);">
                                <span class="badge" style="background:var(--accent-cyan); color:#000;">GROUP INVITATION</span>
                                <h4 style="margin-top: 8px;">Invitation to join: ${req.groupName}</h4>
                                <p style="font-size: 13px; color: var(--text-muted); margin: 6px 0;">Invited by Admin: ${req.adminName}</p>
                                <div style="display: flex; gap: 10px; margin-top: 12px;">
                                    <button type="button" class="futuristic-btn small primary" onclick="respondGroupInvite('${gId}', '${reqId}', true)">Add (Join)</button>
                                    <button type="button" class="futuristic-btn small danger" onclick="respondGroupInvite('${gId}', '${reqId}', false)">Cancel (Reject)</button>
                                </div>
                            </div>
                        `;
                    }
                });
            }
        }
    }

    if (membershipsSnap.exists()) {
        const groupIds = Object.keys(membershipsSnap.val());
        for (const gId of groupIds) {
            const reqSnap = await get(ref(db, `groupRequests/${gId}`));
            if (reqSnap.exists()) {
                reqSnap.forEach(child => {
                    const req = child.val();
                    const reqId = child.key;

                    if (req.status === 'pending' && req.type !== 'group_invite') {
                        if (req.type === 'timetable_modification') {
                            const hasResponded = (req.agreedUids && req.agreedUids.includes(currentUser.uid)) || (req.disagreedUids && req.disagreedUids.includes(currentUser.uid));
                            html += `
                                <div class="glass-card">
                                    <span class="badge" style="background:var(--accent-warning); color:#000;">TIMETABLE ${req.action.toUpperCase()} PROPOSAL</span>
                                    <h4 style="margin-top: 8px;">Purpose: ${req.purpose}</h4>
                                    <p style="font-size: 13px; color: var(--text-muted); margin: 6px 0;">Requires unanimous member agreement.</p>
                                    ${!hasResponded ? `
                                        <div style="display: flex; gap: 10px; margin-top: 12px;">
                                            <button type="button" class="futuristic-btn small primary" onclick="respondTimetableRequest('${gId}', '${reqId}', true)">AGREE</button>
                                            <button type="button" class="futuristic-btn small danger" onclick="respondTimetableRequest('${gId}', '${reqId}', false)">DISAGREE</button>
                                        </div>
                                    ` : `<p style="font-size:12px; color:var(--accent-success); margin-top:8px;">✓ You have already responded to this request.</p>`}
                                </div>
                            `;
                        } else if (req.type === 'voting_session') {
                            html += `
                                <div class="glass-card" style="border: 1px solid var(--accent-cyan);">
                                    <span class="badge" style="background:var(--accent-cyan); color:#000;">VOTING SESSION ACTIVE</span>
                                    <h4 style="margin-top: 8px;">Conflict Vote: Veto or Proceed</h4>
                                    <p style="font-size: 13px; color: var(--text-muted); margin: 6px 0;">Some members disagreed. Vote to proceed or cancel.</p>
                                    <div style="display: flex; gap: 10px; margin-top: 12px;">
                                        <button type="button" class="futuristic-btn small primary" onclick="castVote('${gId}', '${reqId}', 'proceed')">Vote Proceed</button>
                                        <button type="button" class="futuristic-btn small danger" onclick="castVote('${gId}', '${reqId}', 'cancel')">Vote Cancel (Veto)</button>
                                    </div>
                                </div>
                            `;
                        }
                    }
                });
            }
        }
    }

    container.innerHTML = html || '<div class="empty-state">No pending requests or invitations found.</div>';
}

async function respondGroupInvite(groupId, requestId, isAccepted) {
    showLoader();
    const reqRef = ref(db, `groupRequests/${groupId}/${requestId}`);
    const snap = await get(reqRef);
    if (!snap.exists()) { hideLoader(); return; }

    if (isAccepted) {
        await set(ref(db, `memberships/${currentUser.uid}/${groupId}`), 'member');
        await set(ref(db, `groupMembers/${groupId}/${currentUser.uid}`), {
            uid: currentUser.uid,
            role: 'member',
            joinedAt: serverTimestamp()
        });
        await update(reqRef, { status: 'accepted' });
        hideLoader();
        showToast("Invitation accepted! You have joined the group.", "success");
        loadMyGroups();
    } else {
        await update(reqRef, { status: 'cancelled' });
        hideLoader();
        showToast("Group invitation cancelled.", "warning");
        loadRequests();
    }
}

function respondRequest(groupId, requestId) {
    if (!currentUser) return;
    showLoader();
    const reqRef = ref(db, `groupRequests/${groupId}/${requestId}`);
    update(reqRef, { status: 'approved' }).then(() => {
        hideLoader();
        showToast("Agreement registered successfully.", "success");
        loadRequests();
    });
}

async function respondTimetableRequest(groupId, requestId, isAgreed) {
    showLoader();
    const reqRef = ref(db, `groupRequests/${groupId}/${requestId}`);
    const snap = await get(reqRef);
    if (!snap.exists()) { hideLoader(); return; }
    const req = snap.val();

    let agreedUids = req.agreedUids || [];
    let disagreedUids = req.disagreedUids || [];

    if (isAgreed) {
        if (!agreedUids.includes(currentUser.uid)) agreedUids.push(currentUser.uid);
    } else {
        if (!disagreedUids.includes(currentUser.uid)) disagreedUids.push(currentUser.uid);
    }

    const requiredUids = req.requiredUids || [];
    const totalResponses = agreedUids.length + disagreedUids.length;

    if (totalResponses >= requiredUids.length) {
        if (disagreedUids.length === 0) {
            if (req.action === 'edit') {
                await update(ref(db, `timetables/${groupId}/${req.timetableId}`), req.updatedData);
            } else if (req.action === 'delete') {
                await remove(ref(db, `timetables/${groupId}/${req.timetableId}`));
            }
            await update(reqRef, { status: 'approved', agreedUids, disagreedUids });
            showToast("All members agreed! Action executed.", "success");
        } else {
            await update(reqRef, {
                type: 'voting_session',
                agreedUids,
                disagreedUids,
                votes: {}
            });
            showToast(`Dissent registered. Voting session initiated.`, "warning");
        }
    } else {
        await update(reqRef, { agreedUids, disagreedUids });
        showToast("Response recorded.", "success");
    }

    hideLoader();
    loadRequests();
}

async function castVote(groupId, requestId, voteChoice) {
    showLoader();
    const reqRef = ref(db, `groupRequests/${groupId}/${requestId}`);
    const snap = await get(reqRef);
    if (!snap.exists()) { hideLoader(); return; }
    const req = snap.val();

    let votes = req.votes || {};
    votes[currentUser.uid] = voteChoice;

    const requiredUids = req.requiredUids || [];
    const totalVotes = Object.keys(votes).length;

    if (totalVotes >= requiredUids.length) {
        let proceedCount = 0;
        let cancelCount = 0;
        for (const choice of Object.values(votes)) {
            if (choice === 'proceed') proceedCount++;
            else cancelCount++;
        }

        if (proceedCount > cancelCount) {
            if (req.action === 'edit') {
                await update(ref(db, `timetables/${groupId}/${req.timetableId}`), req.updatedData);
            } else if (req.action === 'delete') {
                await remove(ref(db, `timetables/${groupId}/${req.timetableId}`));
            }
            showToast("Vote passed! Action executed by majority.", "success");
        } else {
            showToast("Vote won by members! Action cancelled (Vetoed).", "warning");
        }
        await update(reqRef, { status: 'completed', votes });
    } else {
        await update(reqRef, { votes });
        showToast("Vote cast successfully.", "success");
    }

    hideLoader();
    loadRequests();
}

function renderGroupChat(container) {
    if (!currentUser) return;
    container.innerHTML = `
        <div class="chat-box-container">
            <div id="chat-messages" class="chat-messages-scroll">
                <div class="empty-state" id="chat-status-notice">Checking attendance state...</div>
            </div>
            <div class="chat-input-row" id="chat-input-cluster" style="display:none;">
                <input type="text" id="chat-msg-input" placeholder="Type secure message...">
                <button type="button" id="send-msg-btn" class="futuristic-btn primary">Send</button>
            </div>
        </div>
    `;

    const input = document.getElementById('chat-msg-input');
    const sendBtn = document.getElementById('send-msg-btn');
    const inputCluster = document.getElementById('chat-input-cluster');

    const sendAction = async () => {
        if (!currentUser || !chatSessionActiveState) return;
        const text = input.value.trim();
        if (!text) return;
        await push(ref(db, `messages/${activeGroupId}`), {
            senderUid: currentUser.uid,
            senderName: userData.displayName,
            senderPhoto: userData.photoURL || '',
            text,
            timestamp: serverTimestamp()
        });
        input.value = '';
    };

    sendBtn.addEventListener('click', sendAction);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAction(); });

    const messagesRef = ref(db, `messages/${activeGroupId}`);
    onValue(messagesRef, (snap) => {
        if (!currentUser) return;
        const msgContainer = document.getElementById('chat-messages');
        if (!msgContainer) return;

        if (!chatSessionActiveState) {
            inputCluster.style.display = 'none';
            msgContainer.innerHTML = '<div class="empty-state" style="color:var(--accent-danger);">Chat is closed. Attendance window has ended.</div>';
            return;
        }

        inputCluster.style.display = 'flex';
        if (!snap.exists()) {
            msgContainer.innerHTML = '<div class="empty-state">No messages yet. Start the conversation.</div>';
            return;
        }

        let html = '';
        snap.forEach(child => {
            const msg = child.val();
            const msgId = child.key;
            const isOwn = msg.senderUid === currentUser.uid;
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            
            html += `
                <div class="chat-msg ${isOwn ? 'outgoing' : 'incoming'}" data-msgid="${msgId}">
                    ${!isOwn ? `<div class="sender-name">${msg.senderName}</div>` : ''}
                    <div>${msg.text}</div>
                    <span class="timestamp">${timeStr}</span>
                </div>
            `;
        });
        msgContainer.innerHTML = html;
        msgContainer.scrollTop = msgContainer.scrollHeight;

        document.querySelectorAll('.chat-msg').forEach(el => {
            let pressTimer;
            const mId = el.getAttribute('data-msgid');
            el.addEventListener('mousedown', () => { pressTimer = setTimeout(() => confirmDeleteMessage(mId), 600); });
            el.addEventListener('mouseup', () => clearTimeout(pressTimer));
            el.addEventListener('touchstart', () => { pressTimer = setTimeout(() => confirmDeleteMessage(mId), 600); });
            el.addEventListener('touchend', () => clearTimeout(pressTimer));
        });
    });
}

function confirmDeleteMessage(messageId) {
    openModal(`
        <div class="modal-header">
            <h3>Delete Message</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Do you want to delete this message?</p>
        <button type="button" id="exec-del-msg" class="futuristic-btn danger full-width">DELETE MESSAGE</button>
    `);
    document.getElementById('exec-del-msg').onclick = async () => {
        showLoader();
        await remove(ref(db, `messages/${activeGroupId}/${messageId}`));
        hideLoader();
        closeModal();
        showToast("Message deleted.", "success");
    };
}

async function renderGroupMembers(container) {
    if (!currentUser) return;
    showLoader();
    const membersSnap = await get(ref(db, `groupMembers/${activeGroupId}`));
    hideLoader();

    let html = `
        <div class="section-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3>Group Members</h3>
            ${activeGroupRole === 'admin' ? '<button type="button" class="futuristic-btn small primary" onclick="openAdminInviteModal()">+ Invite Member</button>' : ''}
        </div>
        <div class="vertical-stack" style="margin-top: 16px;">
    `;

    if (membersSnap.exists()) {
        for (const child of Object.values(membersSnap.val())) {
            const uSnap = await get(ref(db, `users/${child.uid}`));
            const uInfo = uSnap.exists() ? uSnap.val() : {};
            html += `
                <div class="glass-card" onclick="viewUserProfile('${child.uid}')" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${uInfo.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + child.uid}" class="user-avatar-sm" alt="Avatar" onclick="event.stopPropagation(); openLightbox('${uInfo.photoURL}')">
                        <div>
                            <strong>${uInfo.displayName || 'Member'}</strong>
                            <p style="font-size: 11px; color: var(--accent-cyan);">@${uInfo.username || 'user'}</p>
                        </div>
                    </div>
                    <span class="badge" style="background:var(--accent-cyan); color:#000;">${child.role.toUpperCase()}</span>
                </div>
            `;
        }
    }
    html += `</div>`;
    container.innerHTML = html;
}

function openAdminInviteModal() {
    if (!currentUser || activeGroupRole !== 'admin') return;
    openModal(`
        <div class="modal-header">
            <h3>Invite Member by Username</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <div class="input-group">
            <label>Username</label>
            <input type="text" id="invite-username-input" placeholder="rahul_01">
        </div>
        <button type="button" id="send-admin-invite-btn" class="futuristic-btn primary full-width">SEND INVITATION</button>
    `);

    document.getElementById('send-admin-invite-btn').onclick = async () => {
        const username = document.getElementById('invite-username-input').value.trim().toLowerCase();
        if (!username) return;

        showLoader();
        const uSnap = await get(ref(db, `usernames/${username}`));
        if (!uSnap.exists()) {
            hideLoader();
            showToast("Username not found.", "danger");
            return;
        }

        const targetUid = uSnap.val();
        if (targetUid === currentUser.uid) {
            hideLoader();
            showToast("You cannot invite yourself.", "warning");
            return;
        }

        const memberCheck = await get(ref(db, `groupMembers/${activeGroupId}/${targetUid}`));
        if (memberCheck.exists()) {
            hideLoader();
            showToast("User is already a member of this group.", "warning");
            return;
        }

        await inviteUserToGroup(targetUid, username);
    };
}

// ==========================================
// 8. NOTIFICATIONS & SETTINGS ROUTER
// ==========================================
async function loadNotifications() {
    if (!currentUser) return;
    const container = document.getElementById('notifications-list');
    if (!container) return;

    showLoader();
    const snap = await get(ref(db, `notifications/${currentUser.uid}`));
    hideLoader();
    if (!snap.exists()) {
        container.innerHTML = '<div class="empty-state">No notifications.</div>';
        return;
    }

    let html = '';
    snap.forEach(child => {
        const notif = child.val();
        const nId = child.key;
        html += `
            <div class="glass-card notif-card" data-notifid="${nId}" style="border-left: 3px solid ${notif.read ? 'var(--text-muted)' : 'var(--accent-cyan)'}; cursor:pointer;">
                <h4>${notif.title}</h4>
                <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">${notif.message}</p>
                <span style="font-size: 10px; color: var(--text-muted); display:block; margin-top:6px;">(Long-press to delete)</span>
            </div>
        `;
    });
    container.innerHTML = html;

    document.querySelectorAll('.notif-card').forEach(el => {
        let pressTimer;
        const nId = el.getAttribute('data-notifid');
        el.addEventListener('mousedown', () => { pressTimer = setTimeout(() => confirmDeleteNotif(nId), 600); });
        el.addEventListener('mouseup', () => clearTimeout(pressTimer));
        el.addEventListener('touchstart', () => { pressTimer = setTimeout(() => confirmDeleteNotif(nId), 600); });
        el.addEventListener('touchend', () => clearTimeout(pressTimer));
    });
}

function confirmDeleteNotif(notifId) {
    openModal(`
        <div class="modal-header">
            <h3>Delete Notification</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Do you want to delete this notification?</p>
        <button type="button" id="exec-del-notif" class="futuristic-btn danger full-width">DELETE NOTIFICATION</button>
    `);
    document.getElementById('exec-del-notif').onclick = async () => {
        showLoader();
        await remove(ref(db, `notifications/${currentUser.uid}/${notifId}`));
        hideLoader();
        closeModal();
        showToast("Notification deleted.", "success");
        loadNotifications();
    };
}

async function markAllNotificationsRead() {
    if (!currentUser) return;
    showLoader();
    const notifRef = ref(db, `notifications/${currentUser.uid}`);
    const snap = await get(notifRef);
    if (snap.exists()) {
        const updates = {};
        snap.forEach(child => { updates[`${child.key}/read`] = true; });
        await update(notifRef, updates);
        hideLoader();
        loadNotifications();
        showToast("All notifications marked as read.", "success");
    } else {
        hideLoader();
    }
}

function listenToBadges() {
    if (!currentUser) return;
    onValue(ref(db, `notifications/${currentUser.uid}`), (snap) => {
        if (!currentUser || !snap.exists()) return;
        let unreadCount = 0;
        snap.forEach(child => { if (!child.val().read) unreadCount++; });
        
        const badgeNotif = document.getElementById('badge-notifications');
        const mobBadgeNotif = document.getElementById('mobile-badge-notifications');

        if (unreadCount > 0) {
            if (badgeNotif) { badgeNotif.innerText = unreadCount; badgeNotif.classList.remove('hidden'); }
            if (mobBadgeNotif) { mobBadgeNotif.innerText = unreadCount; mobBadgeNotif.classList.remove('hidden'); }
        }
    });
}

function renderSettingsView() {
    if (!currentUser || !userData) return;
    const container = document.getElementById('settings-root-container');
    if (!container) return;

    if (currentSettingsSubView === 'main') {
        container.innerHTML = `
            <div class="profile-preview-card">
                <img id="settings-avatar-preview" src="${userData.photoURL}" alt="Avatar" onclick="openLightbox('${userData.photoURL}')" style="cursor:pointer;" title="Click to zoom">
                <div>
                    <h4>${userData.displayName}</h4>
                    <p style="font-size:12px; color:var(--accent-cyan);">@${userData.username}</p>
                    <p style="font-size:12px; color:var(--text-muted); margin-top:4px; font-style:italic;">"${userData.bio || 'No bio set.'}"</p>
                </div>
            </div>
            
            <div class="settings-menu-list">
                <div class="settings-menu-item" onclick="openEditProfileModal()">
                    <span>Edit Profile</span>
                    <span>›</span>
                </div>
                <div class="settings-menu-item" onclick="navigateToSettingsSub('account_center')">
                    <span>Account Center</span>
                    <span>›</span>
                </div>
                <div class="settings-menu-item" onclick="navigateToSettingsSub('session_control')">
                    <span>Session Control</span>
                    <span>›</span>
                </div>
            </div>
        `;
    } else if (currentSettingsSubView === 'account_center') {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button type="button" class="futuristic-btn small secondary" onclick="navigateToSettingsSub('main')">← Back to Settings</button>
                <h3 style="margin-top: 12px;">Account Center</h3>
                <p style="font-size: 13px; color: var(--text-muted);">Manage your security preferences and account lifecycle.</p>
            </div>
            <div class="settings-menu-list">
                <div class="settings-menu-item" onclick="navigateToSettingsSub('privacy_security')">
                    <span>Privacy & Security</span>
                    <span>›</span>
                </div>
                <div class="settings-menu-item" onclick="navigateToSettingsSub('account_deletion')">
                    <span>Account Deletion & Deactivation</span>
                    <span>›</span>
                </div>
            </div>
        `;
    } else if (currentSettingsSubView === 'privacy_security') {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button type="button" class="futuristic-btn small secondary" onclick="navigateToSettingsSub('account_center')">← Back to Account Center</button>
                <h3 style="margin-top: 12px;">Privacy & Security</h3>
                <p style="font-size: 13px; color: var(--text-muted);">Change password or reset credentials securely.</p>
            </div>
            <div class="glass-card" style="max-width: 600px; padding: 24px;">
                <h4>Change Password</h4>
                <div class="input-group" style="margin-top: 14px;">
                    <label>Current Password</label>
                    <div class="password-field-wrapper">
                        <input type="password" id="ch-current-pass" placeholder="••••••••">
                        <button type="button" class="toggle-pass-btn" onclick="togglePasswordVisibility('ch-current-pass', this)">Show</button>
                    </div>
                </div>
                <div class="input-group">
                    <label>New Password</label>
                    <div class="password-field-wrapper">
                        <input type="password" id="ch-new-pass" placeholder="••••••••">
                        <button type="button" class="toggle-pass-btn" onclick="togglePasswordVisibility('ch-new-pass', this)">Show</button>
                    </div>
                </div>
                <div class="input-group">
                    <label>Confirm New Password</label>
                    <div class="password-field-wrapper">
                        <input type="password" id="ch-confirm-pass" placeholder="••••••••">
                        <button type="button" class="toggle-pass-btn" onclick="togglePasswordVisibility('ch-confirm-pass', this)">Show</button>
                    </div>
                </div>
                <button type="button" id="execute-change-pass-btn" class="futuristic-btn primary full-width">Update Password</button>

                <hr style="border-color:rgba(255,255,255,0.1); margin:24px 0;">

                <h4>Reset Password (via Email)</h4>
                <p style="font-size: 12px; color: var(--text-muted); margin: 6px 0 14px 0;">Receive a secure password reset link to your connected email.</p>
                <button type="button" id="execute-reset-pass-btn" class="futuristic-btn secondary full-width">Send Reset Link</button>
            </div>
        `;

        document.getElementById('execute-change-pass-btn').addEventListener('click', async () => {
            const currentPass = document.getElementById('ch-current-pass').value;
            const newPass = document.getElementById('ch-new-pass').value;
            const confirmPass = document.getElementById('ch-confirm-pass').value;

            if (!currentPass || !newPass || !confirmPass) {
                showToast("Please fill in all password fields.", "warning");
                return;
            }
            if (newPass !== confirmPass) {
                showToast("New passwords do not match.", "warning");
                return;
            }

            showLoader();
            try {
                const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
                await reauthenticateWithCredential(currentUser, credential);
                await updatePassword(currentUser, newPass);
                hideLoader();
                showToast("Password updated successfully!", "success");
                document.getElementById('ch-current-pass').value = '';
                document.getElementById('ch-new-pass').value = '';
                document.getElementById('ch-confirm-pass').value = '';
            } catch (err) {
                hideLoader();
                showToast("Incorrect password. Please verify your current password.", "danger");
            }
        });

        document.getElementById('execute-reset-pass-btn').addEventListener('click', async () => {
            showLoader();
            try {
                await sendPasswordResetEmail(auth, currentUser.email);
                hideLoader();
                showToast("Password reset link sent to your email.", "success");
            } catch (err) {
                hideLoader();
                showToast("Password reset link sent to your email.", "success");
            }
        });

    } else if (currentSettingsSubView === 'account_deletion') {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button type="button" class="futuristic-btn small secondary" onclick="navigateToSettingsSub('account_center')">← Back to Account Center</button>
                <h3 style="margin-top: 12px;">Account Deletion & Deactivation</h3>
                <p style="font-size: 13px; color: var(--text-muted);">Temporarily take a break or permanently wipe your account.</p>
            </div>
            <div class="glass-card" style="max-width: 600px; padding: 24px; display:flex; flex-direction:column; gap:16px;">
                <div>
                    <h4>Temporary Deactivation</h4>
                    <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 10px 0;">Your profile and activity will be hidden until you log back in.</p>
                    <button type="button" id="subview-deactivate-btn" class="futuristic-btn secondary full-width">Deactivate Account</button>
                </div>
                <hr style="border-color:rgba(255,75,92,0.3);">
                <div>
                    <h4 style="color:var(--accent-danger);">Permanent Deletion</h4>
                    <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 10px 0;">Irreversible data wipe of all your records and groups membership.</p>
                    <button type="button" id="subview-delete-btn" class="futuristic-btn danger full-width">Delete Account Permanently</button>
                </div>
            </div>
        `;

        document.getElementById('subview-deactivate-btn').addEventListener('click', () => openPasswordConfirmModal('deactivate'));
        document.getElementById('subview-delete-btn').addEventListener('click', () => openPasswordConfirmModal('delete'));

    } else if (currentSettingsSubView === 'session_control') {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button type="button" class="futuristic-btn small secondary" onclick="navigateToSettingsSub('main')">← Back to Settings</button>
                <h3 style="margin-top: 12px;">Session Control</h3>
                <p style="font-size: 13px; color: var(--text-muted);">Manage your active login sessions.</p>
            </div>
            <div class="settings-menu-list">
                <div class="settings-menu-item" onclick="switchAccountPrompt()">
                    <span>🔄 Switch Account</span>
                    <span>›</span>
                </div>
                <div class="settings-menu-item" style="border-color:rgba(255,75,92,0.4); color:var(--accent-danger);" onclick="logoutUser()">
                    <span>🚪 Log Out</span>
                    <span>›</span>
                </div>
            </div>
        `;
    }
}

function navigateToSettingsSub(subView) {
    if (!currentUser) return;
    currentSettingsSubView = subView;
    renderSettingsView();
}

function openEditProfileModal() {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Edit Profile</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <div class="avatar-uploader" style="justify-content:center; margin-bottom:16px;">
            <img id="modal-avatar-preview" src="${userData.photoURL}" style="width:72px; height:72px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-cyan);" alt="Avatar">
            <label class="futuristic-btn small secondary upload-label" style="cursor:pointer;">
                Change Photo <input type="file" id="modal-photo-input" accept="image/*" hidden>
            </label>
        </div>
        <div class="input-group">
            <label>Username <span class="hint">(Changes allowed every 14 days)</span></label>
            <input type="text" id="edit-username" value="${userData.username}">
        </div>
        <div class="input-group">
            <label>Display Name</label>
            <input type="text" id="edit-displayname" value="${userData.displayName}">
        </div>
        <div class="input-group">
            <label>Bio</label>
            <textarea id="edit-bio" rows="2">${userData.bio || ''}</textarea>
        </div>
        <button type="button" id="save-edit-profile-btn" class="futuristic-btn primary full-width">SAVE CHANGES</button>
    `);

    let selectedBlob = null;
    document.getElementById('modal-photo-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        openImageCropper(file, (blob) => {
            selectedBlob = blob;
            document.getElementById('modal-avatar-preview').src = URL.createObjectURL(blob);
        });
    });

    document.getElementById('save-edit-profile-btn').addEventListener('click', async () => {
        const newUsername = document.getElementById('edit-username').value.trim().toLowerCase();
        const displayName = document.getElementById('edit-displayname').value.trim();
        const bio = document.getElementById('edit-bio').value.trim();

        if (!displayName) {
            showToast("Display name cannot be empty.", "warning");
            return;
        }

        const regex = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
        if (!regex.test(newUsername)) {
            showToast("Invalid username format.", "danger");
            return;
        }

        showLoader();
        if (newUsername !== userData.username) {
            const lastChange = userData.lastUsernameChange || 0;
            const fourteenDays = 14 * 24 * 60 * 60 * 1000;
            if (Date.now() - lastChange < fourteenDays) {
                hideLoader();
                const daysLeft = Math.ceil((fourteenDays - (Date.now() - lastChange)) / (1000 * 60 * 60 * 24));
                showToast(`You can change your username again in ${daysLeft} days.`, "warning");
                return;
            }

            const isAvailable = await checkUsernameUnique(newUsername);
            if (!isAvailable) {
                hideLoader();
                showToast("Username already taken.", "danger");
                return;
            }

            await remove(ref(db, `usernames/${userData.username}`));
            await set(ref(db, `usernames/${newUsername}`), currentUser.uid);
            userData.username = newUsername;
            userData.lastUsernameChange = Date.now();
        }

        try {
            let photoURL = userData.photoURL;
            if (selectedBlob) {
                const sRef = storageRef(storage, `avatars/${currentUser.uid}`);
                await uploadBytes(sRef, selectedBlob);
                photoURL = await getDownloadURL(sRef);
            }

            await update(ref(db, `users/${currentUser.uid}`), {
                username: userData.username,
                displayName,
                bio,
                photoURL,
                lastUsernameChange: userData.lastUsernameChange,
                updatedAt: serverTimestamp()
            });

            await updateProfile(currentUser, { displayName, photoURL });

            userData.displayName = displayName;
            userData.bio = bio;
            userData.photoURL = photoURL;
            updateSidebarProfile();
            renderSettingsView();
            hideLoader();
            closeModal();
            showToast("Saved changes successfully!", "success");
        } catch (err) {
            hideLoader();
            showToast(err.message, "danger");
        }
    });
}

function openPasswordConfirmModal(actionType) {
    if (!currentUser) return;
    openModal(`
        <div class="modal-header">
            <h3>Confirm Password</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal()">×</button>
        </div>
        <div class="input-group">
            <label>Enter your password to proceed *</label>
            <div class="password-field-wrapper">
                <input type="password" id="action-confirm-pass" required placeholder="••••••••">
                <button type="button" class="toggle-pass-btn" onclick="togglePasswordVisibility('action-confirm-pass', this)">👁️</button>
            </div>
        </div>
        <button type="button" id="execute-action-btn" class="futuristic-btn danger full-width">CONFIRM & EXECUTE</button>
    `);

    document.getElementById('execute-action-btn').addEventListener('click', async () => {
        const pass = document.getElementById('action-confirm-pass').value;
        if (!pass) return;
        showLoader();
        try {
            const credential = EmailAuthProvider.credential(currentUser.email, pass);
            await reauthenticateWithCredential(currentUser, credential);

            if (actionType === 'deactivate') {
                await update(ref(db, `users/${currentUser.uid}`), { isDeactivated: true });
                hideLoader();
                closeModal();
                signOut(auth);
                showToast("Account deactivated temporarily.", "warning");
            } else if (actionType === 'delete') {
                await remove(ref(db, `users/${currentUser.uid}`));
                if (userData && userData.username) await remove(ref(db, `usernames/${userData.username}`));
                await deleteUser(currentUser);
                hideLoader();
                closeModal();
                showToast("Account permanently deleted.", "success");
            }
        } catch (err) {
            hideLoader();
            showToast("Incorrect password. Please verify and try again.", "danger");
        }
    });
}

// ==========================================
// 9. HELPERS
// ==========================================
function openModal(htmlContent) {
    const backdrop = document.getElementById('modal-backdrop');
    const modalBox = document.getElementById('modal-box');
    modalBox.innerHTML = htmlContent;
    backdrop.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
