// === CONFIGURATION FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyDBRZEZR75WZz4tC0TU0uuc0pDag2r59-Y",
    authDomain: "ffme-plateforme-entrainement.firebaseapp.com",
    projectId: "ffme-plateforme-entrainement",
    storageBucket: "ffme-plateforme-entrainement.firebasestorage.app",
    messagingSenderId: "370389306607",
    appId: "1:370389306607:web:7928e1a19d7db824235f1a"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const defaultCategories = ['Échauffement', 'Physique', 'Volume', 'Rési', 'Force', 'Lecture', 'Mental', 'Débrief'];
const themes1 = ["Dynamiques", "Statiques", "Talon", "Contre-Pointe", "Equilibre", "Gestes en dévers", "Opposition", "Compression", "Bacs", "Réglettes", "Pinces", "Bi-doigt"];
const themes2 = ["Force bras", "Force doigts", "Endurance Phys.", "Souplesse", "Position pieds", "Position corps", "Coordination", "Gestion mentale", "Lecture", "En tête", "Endu. mentale"];

// VARIABLES GLOBALES (Mises à jour en temps réel par Firebase)
let allClubs = [];
let clubMembers = [];
let clubBlocks = [];
let clubSessions = [];
let clubAssignments = [];
let clubMessages = [];
let clubNotifications = [];

let currentUser = null; 
let originalParentUser = null; 
let chartInstances = {}; 

let currentMonth = new Date().getMonth(); let currentYear = new Date().getFullYear();
let selectedDateForNote = null; let selectedUserIdForCalendar = null;
let editingBlockId = null; let editingSessionId = null; let builderBlocks = [];
let currentSessionFilter = 'Toutes'; let coachBlockSearch = ''; let coachSessionSearch = ''; 
let coachBlockFilter = 'Toutes'; let currentSessionLibraryTab = 'personal'; 
let activeChatUserId = null; let editingGroupId = null;
let isRegistering = false; // <-- NOUVEAU FLAG

function getEmptyProfile() {
    let p = { objectives: '', avatar: null, skillsT1: {}, skillsT2: {}, calendar: {}, competitions: [], settings: { autoMessageDisabled: false }, groups: [] };
    themes1.forEach(t => p.skillsT1[t] = 0); themes2.forEach(t => p.skillsT2[t] = 0);
    return p;
}

// === INITIALISATION ET ÉCOUTEURS TEMPS RÉEL ===
function initApp() {
    db.collection('clubs').onSnapshot(snap => {
        allClubs = snap.docs.map(d => d.data());
        if(document.getElementById('auth-screen').style.display !== 'none') updateAuthClubList();
    });

   auth.onAuthStateChanged(async user => {
        if (isRegistering) return; // On ignore l'écouteur pendant la création du compte

        if (user) {
            try {
                if (user.emailVerified) {
                    const uSnap = await db.collection('users').doc(user.uid).get();
                    
                    if (uSnap.exists) {
                        currentUser = uSnap.data();
                        startRealtimeListeners(currentUser.clubId); // Magie du temps réel
                        document.getElementById('loader-screen').style.display = 'none';
                        showApp();
                    } else {
                        // LE BUG ÉTAIT ICI : On déconnectait l'utilisateur sans cacher le loader
                        document.getElementById('loader-screen').style.display = 'none';
                        await auth.signOut();
                        alert("Profil introuvable. Votre compte a été mal créé. Veuillez vous réinscrire.");
                        initAuthUI();
                    }
                } else {
                    document.getElementById('loader-screen').style.display = 'none';
                    await auth.signOut();
                    alert("Veuillez valider votre adresse email en cliquant sur le lien reçu, puis reconnectez-vous.");
                    initAuthUI();
                }
            } catch (error) {
                // S'il y a la moindre erreur (ex: droits Firestore), on cache le loader pour ne pas bloquer l'app
                document.getElementById('loader-screen').style.display = 'none';
                await auth.signOut();
                alert("Erreur de synchronisation : " + error.message);
                initAuthUI();
            }
        } else {
            document.getElementById('loader-screen').style.display = 'none';
            initAuthUI();
        }
    });
// LA MAGIE FIREBASE : Ces écouteurs mettent à jour l'app en temps réel dès qu'une donnée change sur le cloud
let listeners = [];
function startRealtimeListeners(clubId) {
    // Nettoyer les anciens écouteurs si on change de compte
    listeners.forEach(unsub => unsub()); listeners = [];

    listeners.push(db.collection('users').where('clubId', '==', clubId).onSnapshot(snap => {
        clubMembers = snap.docs.map(d => d.data());
        // Mise à jour de currentUser au cas où son propre profil a changé (avatar, etc.)
        const updatedMe = clubMembers.find(u => u.id === currentUser.id);
        if(updatedMe && !originalParentUser) currentUser = updatedMe; 
        refreshCurrentTab();
    }));

    listeners.push(db.collection('blocks').where('clubId', '==', clubId).onSnapshot(snap => {
        clubBlocks = snap.docs.map(d => d.data()); refreshCurrentTab();
    }));

    listeners.push(db.collection('sessions').where('clubId', '==', clubId).onSnapshot(snap => {
        clubSessions = snap.docs.map(d => d.data()); refreshCurrentTab();
    }));

    listeners.push(db.collection('assignments').where('clubId', '==', clubId).onSnapshot(snap => {
        clubAssignments = snap.docs.map(d => d.data()); refreshCurrentTab();
    }));

    listeners.push(db.collection('messages').where('clubId', '==', clubId).onSnapshot(snap => {
        clubMessages = snap.docs.map(d => d.data()); 
        if(document.getElementById('global-chat-panel').style.display === 'flex') {
            if(document.getElementById('chat-view-list').style.display === 'flex') showChatList();
            else loadMessages();
        }
    }));

    listeners.push(db.collection('notifications').where('clubId', '==', clubId).orderBy('timestamp', 'desc').limit(50).onSnapshot(snap => {
        clubNotifications = snap.docs.map(d => d.data()); refreshCurrentTab();
    }));
}

function refreshCurrentTab() {
    if(document.getElementById('coach-dashboard-space').classList.contains('active')) renderCoachDashboard();
    if(document.getElementById('coach-athletes-space').classList.contains('active')) renderCoachAthletes();
    if(document.getElementById('athlete-sessions-space').classList.contains('active')) renderAthleteSessions();
    if(document.getElementById('athlete-profile-space').classList.contains('active')) renderAthleteProfile();
}

function updateAuthClubList() {
    const select = document.getElementById('reg-club');
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Choisir un club --</option>';
    allClubs.forEach(c => select.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    select.innerHTML += `<option value="_new_" style="font-weight:700; color:var(--ffme-blue-dark);">➕ Créer un nouveau club...</option>`;
    if(currentVal) select.value = currentVal;
}

// === AUTHENTIFICATION ===
function initAuthUI() {
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    updateAuthClubList();
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.querySelector('.auth-tabs').children[tab==='login'?0:1].classList.add('active');
}
function checkNewClubAuth(s) { document.getElementById('reg-new-club-group').style.display = s.value === '_new_' ? 'block' : 'none'; }
function checkDobForParentCode() {
    const dobStr = document.getElementById('reg-dob').value; if(!dobStr) return;
    const age = (new Date() - new Date(dobStr)) / (1000*60*60*24*365.25);
    document.getElementById('reg-parent-code-group').style.display = age >= 18 ? 'block' : 'none';
}

async function register() {
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const username = document.getElementById('reg-username').value.trim();
    const dob = document.getElementById('reg-dob').value;
    const role = document.getElementById('reg-role').value;
    let clubId = document.getElementById('reg-club').value;

    if (!email || !password || !username || !dob) return alert("Veuillez remplir tous les champs.");
    
    let newClubName = '';
    if (clubId === '_new_') {
        newClubName = document.getElementById('reg-new-club').value.trim();
        if (!newClubName) return alert("Nom du club requis.");
        clubId = 'club_' + Date.now();
    } else if (!clubId) return alert("Sélectionnez un club.");

    document.getElementById('loader-screen').style.display = 'flex';
    isRegistering = true; // On bloque la déconnexion automatique

    try {
        // 1. Création du compte Firebase Auth (Firebase nous connecte automatiquement)
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 2. Maintenant qu'on est authentifié, Firebase nous autorise à créer le club !
        if (document.getElementById('reg-club').value === '_new_') {
            await db.collection('clubs').doc(clubId).set({ id: clubId, name: newClubName, categories: defaultCategories });
        }

        const age = (new Date() - new Date(dob)) / (1000*60*60*24*365.25);
        const parentCode = age < 18 ? Math.floor(10000 + Math.random() * 90000).toString() : null;

        const newUser = { id: user.uid, email: email, username, role, clubId, dob, parentCode, linkedChildren: [], profile: getEmptyProfile() };
        
        if(age >= 18) {
            const code = document.getElementById('reg-link-code').value.trim();
            if(code) {
                const childSnap = await db.collection('users').where('parentCode', '==', code).get();
                if(!childSnap.empty) newUser.linkedChildren.push(childSnap.docs[0].id);
            }
        }
        
        // 3. On crée le profil utilisateur
        await db.collection('users').doc(newUser.id).set(newUser);
        
        // 4. On envoie l'email, on déconnecte proprement et on enlève le drapeau
        await user.sendEmailVerification();
        await auth.signOut();
        isRegistering = false; 
        
        document.getElementById('loader-screen').style.display = 'none';
        alert("Compte créé avec succès ! Un email de vérification vous a été envoyé. Veuillez cliquer sur le lien avant de vous connecter.");
        switchAuthTab('login');
    } catch (error) {
        isRegistering = false; // En cas d'erreur, on réactive aussi l'écouteur
        document.getElementById('loader-screen').style.display = 'none';
        if (error.code === 'auth/email-already-in-use') alert("Cette adresse email est déjà utilisée.");
        else if (error.code === 'auth/weak-password') alert("Le mot de passe doit contenir au moins 6 caractères.");
        else alert("Erreur lors de l'inscription : " + error.message);
    }
}
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return alert("Veuillez remplir tous les champs.");

    document.getElementById('loader-screen').style.display = 'flex';
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        document.getElementById('loader-screen').style.display = 'none';
        alert("Email ou mot de passe incorrect.");
    }
}

async function resetPassword() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return alert("Veuillez saisir votre adresse email dans le champ pour réinitialiser le mot de passe.");
    try {
        await auth.sendPasswordResetEmail(email);
        alert("Un email de réinitialisation vous a été envoyé.");
    } catch (error) {
        alert("Erreur ou email introuvable.");
    }
}

function logout() { auth.signOut().then(() => { currentUser = null; originalParentUser = null; initAuthUI(); }); }

// === COMPTES LIES ===
function toggleAccountMenu() {
    const dd = document.getElementById('account-dropdown'); const realUser = originalParentUser || currentUser;
    if(realUser.linkedChildren.length === 0 && !originalParentUser) return;
    if(dd.style.display === 'block') { dd.style.display = 'none'; return; }
    let html = '';
    if(originalParentUser) html += `<button onclick="switchAccount('${originalParentUser.id}')">↩ Retour Parent (${originalParentUser.username})</button>`;
    realUser.linkedChildren.forEach(cId => {
        const c = clubMembers.find(u=>u.id===cId);
        if(c && c.id !== currentUser.id) html += `<button onclick="switchAccount('${c.id}')">👶 Basculer vers ${c.username}</button>`;
    });
    dd.innerHTML = html; dd.style.display = 'block';
}
function switchAccount(targetId) {
    const target = clubMembers.find(u=>u.id===targetId);
    if(!originalParentUser) originalParentUser = currentUser; 
    if(targetId === originalParentUser.id) originalParentUser = null; 
    document.getElementById('account-dropdown').style.display = 'none'; 
    currentUser = target;
    showApp();
}
function openLinkChildModal() { document.getElementById('input-link-child').value = ''; openModal('modal-link-child'); }
async function linkChildAccount() {
    const code = document.getElementById('input-link-child').value.trim();
    const child = clubMembers.find(u => u.parentCode === code);
    if(child) {
        if(!currentUser.linkedChildren.includes(child.id)) {
            currentUser.linkedChildren.push(child.id);
            await db.collection('users').doc(currentUser.id).update({ linkedChildren: currentUser.linkedChildren });
        }
        alert("Compte lié !"); closeModal('modal-link-child'); showApp();
    } else alert("Code invalide.");
}

// === NAVIGATION ===
function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    
    let userText = `👤 ${currentUser.username} <span style="opacity:0.7; font-size:0.8rem; margin-left:4px;">(${currentUser.role})</span>`;
    if(originalParentUser) userText += ` <span style="font-size:0.75rem; background:var(--ffme-red); color:white; padding:2px 6px; border-radius:4px; margin-left:8px;">Vue Enfant</span>`;
    document.getElementById('header-user-info-text').innerHTML = userText;
    
    const coachTabs = document.querySelectorAll('.coach-only');
    if (currentUser.role === 'coach') {
        coachTabs.forEach(el => el.style.display = 'inline-block');
        switchTab('coach-dashboard');
        updateCategorySelect();
    } else {
        coachTabs.forEach(el => el.style.display = 'none');
        switchTab('athlete-sessions');
    }
    const age = (new Date() - new Date(currentUser.dob)) / (1000*60*60*24*365.25);
    const btnLink = document.getElementById('btn-link-child');
    if(btnLink) btnLink.style.display = age >= 18 ? 'inline-block' : 'none';
}
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
    document.getElementById(tab + '-space').classList.add('active');
    const navBtn = document.getElementById('nav-' + tab); if(navBtn) navBtn.classList.add('active');
    refreshCurrentTab();
}
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// === NOTIFICATIONS ===
function pushNotification(text) {
    const notif = { id: 'notif_'+Date.now(), clubId: currentUser.clubId, text, date: new Date().toLocaleDateString('fr-FR', { hour: '2-digit', minute:'2-digit' }), timestamp: Date.now() };
    db.collection('notifications').doc(notif.id).set(notif);
}
function renderNotifications() {
    const panel = document.getElementById('coach-notifications');
    const list = document.getElementById('notifications-list');
    const allList = document.getElementById('all-notifications-list');
    
    if(clubNotifications && clubNotifications.length > 0) {
        panel.style.display = 'block';
        list.innerHTML = clubNotifications.slice(0, 3).map(n => `<div class="notif-item"><span class="notif-date">${n.date}</span> <span>${n.text}</span></div>`).join('');
        allList.innerHTML = clubNotifications.map(n => `<div class="notif-item"><span class="notif-date">${n.date}</span> <span>${n.text}</span></div>`).join('');
    } else {
        panel.style.display = 'none';
        allList.innerHTML = "<p>Aucune notification.</p>";
    }
}

// === COACH : DASHBOARD / BUILDER ===
function getMyClubObj() { return allClubs.find(c => c.id === currentUser.clubId) || { categories: defaultCategories }; }

function updateCategorySelect() {
    const select = document.getElementById('block-category');
    select.innerHTML = ''; getMyClubObj().categories.forEach(cat => select.innerHTML += `<option value="${cat}">${cat}</option>`);
    select.innerHTML += `<option value="_new_" style="font-weight:700; color:var(--ffme-blue);">+ Nouvelle catégorie...</option>`;
}
function checkNewCategory(s) { if(s.value === '_new_') { openModal('modal-new-category'); document.getElementById('new-category-name').value=''; } }
async function saveNewCategory() {
    const c = document.getElementById('new-category-name').value.trim();
    const club = getMyClubObj();
    if(c && !club.categories.includes(c)) {
        club.categories.push(c); 
        await db.collection('clubs').doc(club.id).update({ categories: club.categories });
        updateCategorySelect();
        document.getElementById('block-category').value = c; 
        closeModal('modal-new-category');
    }
}

function openCreateBlock() { editingBlockId = null; document.getElementById('modal-block-title-text').textContent = "Créer un Bloc"; document.getElementById('block-title').value = ''; document.getElementById('block-desc').value = ''; openModal('modal-create-block'); }
function openEditBlock(id) {
    editingBlockId = id; const b = clubBlocks.find(x => x.id === id);
    document.getElementById('modal-block-title-text').textContent = "Modifier le Bloc";
    document.getElementById('block-category').value = b.category; document.getElementById('block-title').value = b.title; document.getElementById('block-desc').value = b.description;
    openModal('modal-create-block');
}
function deleteBlock(id) {
    if(!confirm("Êtes-vous sûr de vouloir supprimer ce bloc définitivement ?")) return;
    db.collection('blocks').doc(id).delete();
}

function saveBlock() {
    const title = document.getElementById('block-title').value.trim(); const desc = document.getElementById('block-desc').value.trim(); const cat = document.getElementById('block-category').value;
    if (!title || cat === '_new_') return alert("Veuillez remplir le titre et la catégorie.");
    
    let blockData = { title, category: cat, description: desc, clubId: currentUser.clubId };
    if (editingBlockId) {
        db.collection('blocks').doc(editingBlockId).update(blockData);
    } else {
        blockData.id = 'blk_' + Date.now();
        db.collection('blocks').doc(blockData.id).set(blockData);
    }
    closeModal('modal-create-block');
    if (document.getElementById('modal-create-session').style.display === 'flex') updateBuilderBlocksList();
}

// BUILDER SÉANCE
function openSessionBuilder() { editingSessionId = null; builderBlocks = []; currentSessionFilter = 'Toutes'; document.getElementById('modal-session-title-text').textContent = "Créer une Séance"; document.getElementById('session-name').value = ''; buildFilters(); updateBuilderBlocksList(); updateBuilderSeq(); openModal('modal-create-session'); }
function buildFilters() { document.getElementById('builder-filters').innerHTML = `<span class="filter-tag ${currentSessionFilter==='Toutes'?'active':''}" onclick="setBuilderFilter('Toutes')">Toutes</span>` + getMyClubObj().categories.map(cat => `<span class="filter-tag ${currentSessionFilter===cat?'active':''}" onclick="setBuilderFilter('${cat}')">${cat}</span>`).join(''); }
function setBuilderFilter(cat) { currentSessionFilter = cat; buildFilters(); updateBuilderBlocksList(); }
function updateBuilderBlocksList() {
    const filtered = currentSessionFilter === 'Toutes' ? clubBlocks : clubBlocks.filter(b => b.category === currentSessionFilter);
    document.getElementById('builder-blocks-list').innerHTML = filtered.map(b => `<div style="background:var(--surface); border:1px solid var(--border-color); padding:1rem; border-radius:var(--radius-md); cursor:pointer;" onclick="addBlockToBuilder('${b.id}')"><div style="font-size:0.75rem; color:var(--ffme-blue); font-weight:800; text-transform:uppercase;">${b.category}</div><div style="font-weight:700;">${b.title}</div></div>`).join('');
}
function addBlockToBuilder(id) { builderBlocks.push(id); updateBuilderSeq(); }
function removeBlockFromBuilder(index) { builderBlocks.splice(index, 1); updateBuilderSeq(); }

let dragSrcIndex = null;
function dragStart(e, i) { dragSrcIndex = i; e.dataTransfer.effectAllowed = 'move'; }
function dragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; }
function dropBlock(e, targetIndex) { e.stopPropagation(); if (dragSrcIndex !== targetIndex && dragSrcIndex !== null) { const moved = builderBlocks.splice(dragSrcIndex, 1)[0]; builderBlocks.splice(targetIndex, 0, moved); updateBuilderSeq(); } return false; }

function updateBuilderSeq() {
    document.getElementById('session-sequence').innerHTML = builderBlocks.map((id, i) => {
        const b = clubBlocks.find(x=>x.id===id); if(!b) return '';
        return `<div class="draggable-item" draggable="true" ondragstart="dragStart(event, ${i})" ondragover="dragOver(event)" ondrop="dropBlock(event, ${i})"><span><b style="color:var(--text-muted); margin-right:8px;">☰</b> ${i+1}. ${b.title}</span><button class="btn-icon" onclick="removeBlockFromBuilder(${i})">✖</button></div>`;
    }).join('');
}
function saveSession() {
    const name = document.getElementById('session-name').value.trim();
    if(!name || builderBlocks.length===0) return;
    
    let sessionData = { name, blocks: builderBlocks, clubId: currentUser.clubId };
    
    if(editingSessionId) { 
        db.collection('sessions').doc(editingSessionId).update(sessionData);
    } else { 
        sessionData.id = 'sess_' + Date.now();
        sessionData.authorId = currentUser.id;
        sessionData.isShared = false;
        db.collection('sessions').doc(sessionData.id).set(sessionData);
    }
    closeModal('modal-create-session'); setSessionLibraryTab('personal');
}

function duplicateSession(id) {
    const s = clubSessions.find(x => x.id === id);
    const newSession = { id: 'sess_' + Date.now(), name: s.name + " (Copie)", blocks: [...s.blocks], clubId: currentUser.clubId, authorId: currentUser.id, isShared: false };
    db.collection('sessions').doc(newSession.id).set(newSession);
    setSessionLibraryTab('personal'); 
}
function deleteSession(id) {
    if(!confirm("Supprimer cette séance ?")) return;
    db.collection('sessions').doc(id).delete();
}
function openEditSession(id) {
    editingSessionId = id; const s = clubSessions.find(x => x.id === id);
    document.getElementById('modal-session-title-text').textContent = "Modifier la Séance"; document.getElementById('session-name').value = s.name;
    builderBlocks = [...s.blocks]; currentSessionFilter = 'Toutes';
    buildFilters(); updateBuilderBlocksList(); updateBuilderSeq(); openModal('modal-create-session');
}

// COACH DASHBOARD UI
function setCoachBlockFilter(cat) { coachBlockFilter = cat; renderCoachDashboard(); }
function updateCoachBlockSearch(val) { coachBlockSearch = val; renderCoachDashboard(); }
function updateCoachSessionSearch(val) { coachSessionSearch = val; renderCoachDashboard(); }
function setSessionLibraryTab(tab) { currentSessionLibraryTab = tab; document.getElementById('tab-btn-perso').classList.toggle('active', tab === 'personal'); document.getElementById('tab-btn-club').classList.toggle('active', tab === 'club'); renderCoachDashboard(); }

function renderCoachDashboard() {
    renderNotifications();
    const clubCats = getMyClubObj().categories;
    document.getElementById('coach-dashboard-filters').innerHTML = `<span class="filter-tag ${coachBlockFilter==='Toutes'?'active':''}" onclick="setCoachBlockFilter('Toutes')">Toutes</span>` + clubCats.map(cat => `<span class="filter-tag ${coachBlockFilter===cat?'active':''}" onclick="setCoachBlockFilter('${cat}')">${cat}</span>`).join('');
    
    let fBlocks = coachBlockFilter === 'Toutes' ? clubBlocks : clubBlocks.filter(b => b.category === coachBlockFilter);
    if (coachBlockSearch) fBlocks = fBlocks.filter(b => b.title.toLowerCase().includes(coachBlockSearch.toLowerCase()));
    document.getElementById('coach-blocks-grid').innerHTML = fBlocks.map(b => `<div class="card"><div class="card-header"><span class="card-category">${b.category}</span><div style="display:flex;gap:0.25rem;"><button class="btn-icon" style="padding:0;" onclick="openEditBlock('${b.id}')">✏️</button><button class="btn-icon" style="padding:0; color:var(--ffme-red);" onclick="deleteBlock('${b.id}')">🗑️</button></div></div><div class="card-title">${b.title}</div><p style="font-size:0.95rem; color:var(--text-muted);">${b.description}</p></div>`).join('');
    
    let tSessions = currentSessionLibraryTab === 'personal' ? clubSessions.filter(s => s.authorId === currentUser.id && !s.isShared) : clubSessions.filter(s => s.isShared);
    if (coachSessionSearch) tSessions = tSessions.filter(s => s.name.toLowerCase().includes(coachSessionSearch.toLowerCase()));
    document.getElementById('coach-sessions-grid').innerHTML = tSessions.map(s => {
        let shareBtn = currentSessionLibraryTab === 'personal' ? `<button class="btn-outline" style="width:100%; margin-bottom:1rem;" onclick="publishToClub('${s.id}')">Partager au Club</button>` : '';
        let actions = `<button class="btn-icon" title="Dupliquer" onclick="duplicateSession('${s.id}')">📋</button>`;
        if(s.authorId === currentUser.id || !s.authorId) {
            actions += ` <button class="btn-icon" title="Modifier" onclick="openEditSession('${s.id}')">✏️</button> <button class="btn-icon" style="color:var(--ffme-red);" title="Supprimer" onclick="deleteSession('${s.id}')">🗑️</button>`;
        }

        const pendingAssigns = clubAssignments.filter(a => a.sessionId === s.id && !a.isDone);
        let assignedHtml = '';
        if(pendingAssigns.length > 0) {
            const names = pendingAssigns.map(a => { const u = clubMembers.find(x=>x.id===a.athleteId); return u ? u.username : ''; }).filter(Boolean).join(', ');
            assignedHtml = `<div style="font-size:0.8rem; color:var(--ffme-blue-dark); background:#EFF6FF; padding:0.5rem 0.8rem; border-radius:var(--radius-md); margin-bottom:1rem; font-weight:600; border:1px solid #BFDBFE;">En cours par : ${names}</div>`;
        }

        return `<div class="card">
                    <div class="card-header" style="align-items:flex-start;">
                        <div class="card-title" style="flex:1;">${s.name}</div>
                        <div style="display:flex; gap:0.25rem;">${actions}</div>
                    </div>
                    <p style="font-size:0.95rem; color:var(--text-muted); font-weight:600; margin-bottom:1.5rem; margin-top:0;">🧗 ${s.blocks.length} exercices</p>
                    ${assignedHtml}
                    ${shareBtn}
                    <button class="btn-primary" style="width:100%; margin-top:auto;" onclick="openAssignModal('${s.id}')">👥 Attribuer</button>
                </div>`;
    }).join('');
}

function publishToClub(id) { 
    const s = clubSessions.find(x => x.id === id); 
    const newSession = { id: 'sess_' + Date.now(), name: s.name, blocks: [...s.blocks], clubId: currentUser.clubId, authorId: currentUser.id, isShared: true };
    db.collection('sessions').doc(newSession.id).set(newSession);
    setSessionLibraryTab('club'); 
}

// --- ATTRIBUTION AVEC GROUPES ---
let sessionToAssignId = null;
function openAssignModal(sessId) {
    sessionToAssignId = sessId; 
    const pendingExist = clubAssignments.filter(a => a.sessionId === sessId && !a.isDone);
    
    const grpContainer = document.getElementById('assign-groups-container');
    grpContainer.innerHTML = '';
    if(currentUser.profile.groups && currentUser.profile.groups.length > 0) {
        let html = `<h3 style="border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">Groupes</h3>`;
        currentUser.profile.groups.forEach(g => {
            html += `
            <div style="background:var(--surface); border:1px solid var(--border-color); border-radius:var(--radius-md); margin-bottom:0.75rem; padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <strong style="font-size:1.1rem; color:var(--ffme-blue);">${g.name}</strong>
                    <button class="btn-outline" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="checkGroupAthletes('${g.id}')">Tout cocher</button>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;" class="group-checkboxes-${g.id}">
                    ${g.athletes.map(aId => {
                        const ath = clubMembers.find(u=>u.id===aId); if(!ath) return '';
                        return `<label style="font-size:0.85rem;"><input type="checkbox" class="athlete-checkbox" value="${ath.id}" ${pendingExist.some(ex => ex.athleteId === ath.id)?'disabled checked':''}> ${ath.username}</label>`;
                    }).join('')}
                </div>
            </div>`;
        });
        grpContainer.innerHTML = html;
    }

    document.getElementById('athlete-checklist').innerHTML = clubMembers.map(a => `<label style="display:flex; gap:1rem; padding:0.5rem; background:var(--surface); border:1px solid var(--border-color); border-radius:var(--radius-md); margin-bottom:0.5rem; cursor:pointer;"><input type="checkbox" class="athlete-checkbox" value="${a.id}" ${pendingExist.some(ex => ex.athleteId === a.id)?'disabled checked':''}> ${a.username} (${a.role})</label>`).join('');
    openModal('modal-assign-session');
}

function checkGroupAthletes(gId) { document.querySelectorAll(`.group-checkboxes-${gId} input:not(:disabled)`).forEach(cb => cb.checked = true); }
function selectAllAthletes() { document.querySelectorAll('#athlete-checklist input:not(:disabled)').forEach(cb => cb.checked = true); }

function saveAssignments() { 
    let selectedIds = new Set();
    document.querySelectorAll('.athlete-checkbox:checked:not(:disabled)').forEach(cb => selectedIds.add(cb.value));
    
    const batch = db.batch();
    selectedIds.forEach(id => { 
        const assRef = db.collection('assignments').doc('ass_' + Date.now() + Math.random().toString(36).substr(2, 9));
        batch.set(assRef, { clubId: currentUser.clubId, sessionId: sessionToAssignId, athleteId: id, assignerId: currentUser.id, isDone: false, annotation: '', blockRpes: {}, avgRpe: null, plaisir: null, difficulte: null, fatigue: null, doneAt: null });
    }); 
    batch.commit().then(() => { closeModal('modal-assign-session'); });
}

// --- GESTION DES GROUPES (COACH) ---
function openManageGroupsModal() {
    editingGroupId = null;
    renderManageGroupsList();
    document.getElementById('new-group-athletes').innerHTML = clubMembers.map(a => `<label style="display:flex; gap:1rem; padding:0.4rem;"><input type="checkbox" class="new-grp-cb" value="${a.id}"> ${a.username} (${a.role})</label>`).join('');
    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-notify').checked = false;
    document.getElementById('btn-save-group').textContent = "Créer le groupe";
    openModal('modal-manage-groups');
}
function editGroup(id) {
    editingGroupId = id;
    const g = currentUser.profile.groups.find(x => x.id === id);
    document.getElementById('new-group-name').value = g.name;
    document.getElementById('new-group-notify').checked = g.notify || false;
    document.querySelectorAll('.new-grp-cb').forEach(cb => { cb.checked = g.athletes.includes(cb.value); });
    document.getElementById('btn-save-group').textContent = "Modifier le groupe";
}
async function deleteGroup(gId) {
    if(!confirm("Supprimer ce groupe ?")) return;
    currentUser.profile.groups = currentUser.profile.groups.filter(g => g.id !== gId);
    await db.collection('users').doc(currentUser.id).update({ 'profile.groups': currentUser.profile.groups });
    renderManageGroupsList();
}
async function saveNewGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    const notify = document.getElementById('new-group-notify').checked;
    if(!name) return;
    let ids = []; document.querySelectorAll('.new-grp-cb:checked').forEach(cb => ids.push(cb.value));
    
    if(editingGroupId) {
        const g = currentUser.profile.groups.find(x => x.id === editingGroupId);
        g.name = name; g.athletes = ids; g.notify = notify;
        editingGroupId = null;
    } else {
        currentUser.profile.groups.push({ id: 'grp_' + Date.now(), name, athletes: ids, notify });
    }
    await db.collection('users').doc(currentUser.id).update({ 'profile.groups': currentUser.profile.groups });
    
    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-notify').checked = false;
    document.querySelectorAll('.new-grp-cb').forEach(cb => cb.checked = false);
    document.getElementById('btn-save-group').textContent = "Créer le groupe";
    renderManageGroupsList();
}
function renderManageGroupsList() {
    document.getElementById('existing-groups-list').innerHTML = currentUser.profile.groups.map(g => `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:0.75rem; border-radius:var(--radius-md); margin-bottom:0.5rem;"><span><strong>${g.name}</strong> (${g.athletes.length} membres) ${g.notify?'🔔':''}</span><div style="display:flex;gap:0.5rem;"><button class="btn-icon" onclick="editGroup('${g.id}')">✏️</button><button class="btn-icon" style="color:var(--ffme-red);" onclick="deleteGroup('${g.id}')">🗑️</button></div></div>`).join('') || "<p style='color:var(--text-muted); font-size:0.9rem;'>Aucun groupe créé.</p>";
}

// --- COACH ATHLETES VIEW ---
function renderCoachAthletes() {
    document.getElementById('coach-groups-view').style.display = 'grid';
    document.getElementById('coach-athletes-view').style.display = 'none';

    let html = `<div class="card interactive" style="align-items:center; text-align:center; background: var(--gradient-primary); color: white; border:none;" onclick="showAthletesGrid('all')">
                    <div style="font-size:2.5rem; margin-bottom:0.5rem;">🌍</div>
                    <div class="card-title" style="color:white; font-size:1.3rem;">Tous les membres</div>
                    <div style="font-size:0.9rem; opacity:0.9;">${clubMembers.length} membres</div>
                </div>`;
                
    if(currentUser.profile.groups && currentUser.profile.groups.length > 0) {
        currentUser.profile.groups.forEach(g => {
            html += `<div class="card interactive" style="align-items:center; text-align:center;" onclick="showAthletesGrid('${g.id}')">
                        <div style="font-size:2.5rem; margin-bottom:0.5rem;">👥</div>
                        <div class="card-title" style="font-size:1.3rem;">${g.name}</div>
                        <div style="font-size:0.9rem; color:var(--text-muted); font-weight:600;">${g.athletes.length} membres</div>
                     </div>`;
        });
    }
    document.getElementById('coach-groups-view').innerHTML = html;
}

function showAthletesGrid(groupId) {
    document.getElementById('coach-groups-view').style.display = 'none';
    document.getElementById('coach-athletes-view').style.display = 'block';
    
    let targetAthletes = [];
    let title = "";

    if(groupId === 'all') {
        targetAthletes = clubMembers;
        title = "Tous les membres";
    } else {
        const g = currentUser.profile.groups.find(x => x.id === groupId);
        if(g) {
            title = "Groupe : " + g.name;
            targetAthletes = g.athletes.map(id => clubMembers.find(u => u.id === id)).filter(Boolean);
        }
    }
    
    document.getElementById('current-group-title').textContent = title;

    document.getElementById('coach-athletes-grid').innerHTML = targetAthletes.map(ath => {
        const pending = clubAssignments.filter(a => a.athleteId === ath.id && !a.isDone).length;
        let badge = pending > 0 ? `<span class="status-badge status-done">${pending} attente</span>` : `<span class="status-badge status-alert">0 séance</span>`;
        let avatarHtml = `<div style="font-size:2rem; margin-bottom:0.5rem; width:60px; height:60px; display:flex; align-items:center; justify-content:center; background:var(--bg-color); border-radius:50%;">👤</div>`;
        if(ath.profile && ath.profile.avatar) avatarHtml = `<img src="${ath.profile.avatar}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; margin-bottom:0.5rem;">`;
        return `<div class="card interactive" style="align-items:center; text-align:center;" onclick="openAthleteProfileCoach('${ath.id}')">${avatarHtml}<div class="card-title">${ath.username} <span style="font-size:0.8rem; opacity:0.7;">(${ath.role})</span></div><div>${badge}</div></div>`;
    }).join('') || "<p style='color:var(--text-muted); grid-column:1/-1; text-align:center;'>Aucun membre dans cette liste.</p>";
}

function backToGroupsView() { renderCoachAthletes(); }

let viewedAthleteId = null;
function openAthleteProfileCoach(athId) {
    viewedAthleteId = athId;
    const ath = clubMembers.find(u => u.id === athId);
    document.getElementById('view-athlete-name').textContent = "Profil de " + ath.username;
    document.getElementById('view-athlete-objectives').textContent = ath.profile.objectives || "Aucun objectif.";
    document.getElementById('view-athlete-comps').innerHTML = ath.profile.competitions.map(c => `<div class="comp-item"><b>${c.type}</b> - ${c.place}<br><span style="font-size:0.9rem; color:var(--text-muted);">${c.feeling}</span></div>`).join('') || "<p style='color:var(--text-muted);'>Aucune compétition.</p>";

    renderRadarChart('chart-t1-coach', ath.profile.skillsT1, "Technique & Gestuelle", 'rgba(0, 85, 164, 0.5)');
    renderRadarChart('chart-t2-coach', ath.profile.skillsT2, "Physique & Mental", 'rgba(239, 65, 53, 0.5)');
    selectedUserIdForCalendar = ath.id; renderCalendar('coach-view-calendar-container');
    
    switchAthleteViewTab('profil');
    openModal('modal-view-athlete');
}

function switchAthleteViewTab(tab) {
    document.getElementById('btn-tab-ath-profil').classList.toggle('active', tab === 'profil');
    document.getElementById('btn-tab-ath-hist').classList.toggle('active', tab === 'historique');
    document.getElementById('coach-ath-view-profil').style.display = tab === 'profil' ? 'block' : 'none';
    document.getElementById('coach-ath-view-historique').style.display = tab === 'historique' ? 'block' : 'none';
    
    if(tab === 'historique') {
        const dones = clubAssignments.filter(a => a.athleteId === viewedAthleteId && a.isDone).sort((a,b) => (b.doneAt||0) - (a.doneAt||0));
        
        document.getElementById('coach-ath-history-list').innerHTML = dones.map(a => {
            const s = clubSessions.find(x => x.id === a.sessionId);
            if(!s) return '';
            const rpeWarning = a.avgRpe >= 8 ? 'alert-rpe' : '';
            return `<div class="card interactive ${rpeWarning}" onclick="viewSessionReadonly('${a.id}')">
                        <div class="card-header"><span class="card-category">RPE Moyen : ${a.avgRpe ? a.avgRpe.toFixed(1) : '-'}</span></div>
                        <div class="card-title">${s.name}</div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">${a.doneAt ? new Date(a.doneAt).toLocaleDateString() : ''}</div>
            </div>`;
        }).join('') || "<p style='color:var(--text-muted);'>Aucun historique.</p>";
    }
}

function viewSessionReadonly(assId) {
    const a = clubAssignments.find(x => x.id === assId);
    const s = clubSessions.find(x => x.id === a.sessionId);
    
    if(s.authorId !== currentUser.id && !s.isShared && currentUser.id !== a.athleteId) {
        alert("Accès refusé : Cette séance appartient à un autre coach et n'a pas été partagée."); return;
    }

    document.getElementById('view-session-title').textContent = s.name + " (Lecture Seule)";
    document.getElementById('view-session-athlete-form').style.display = 'none';
    document.getElementById('view-session-coach-readonly').style.display = 'block';

    document.getElementById('view-session-content-coach').innerHTML = s.blocks.map((bId, i) => {
        const b = clubBlocks.find(x=>x.id===bId);
        let rpeHtml = '';
        if(b && b.category !== 'Débrief') {
            const blockRpeVal = (a.blockRpes && a.blockRpes[bId]) ? a.blockRpes[bId] : '-';
            rpeHtml = `<div style="margin-top:0.75rem; font-size:0.9rem; color:var(--ffme-red); font-weight:700;">RPE Donné : ${blockRpeVal}</div>`;
        }
        return b ? `<div style="padding:1rem; border:1px solid var(--border-color); border-left:4px solid var(--ffme-blue); border-radius:var(--radius-md); margin-bottom:1rem; background:var(--surface);">
                    <div class="card-category" style="margin-bottom:0.5rem;">${b.category}</div>
                    <div style="font-weight:800; font-size:1.1rem; margin-bottom:0.5rem;">${i+1}. ${b.title}</div>
                    <div style="white-space:pre-wrap; font-size:0.95rem; color:var(--text-muted);">${b.description}</div>
                    ${rpeHtml}
                </div>` : '';
    }).join('');
    
    document.getElementById('ro-val-plaisir').textContent = a.plaisir || '-';
    document.getElementById('ro-val-diff').textContent = a.difficulte || '-';
    document.getElementById('ro-val-fatigue').textContent = a.fatigue || '-';
    document.getElementById('ro-val-note').textContent = a.annotation || 'Aucune note ou lien renseigné.';
    openModal('modal-view-session');
}

// --- ATHLETE : SESSIONS & EXECUTION ---
function renderAthleteSessions() {
    const myAss = clubAssignments.filter(a => a.athleteId === currentUser.id);
    const todo = myAss.filter(a => !a.isDone); const done = myAss.filter(a => a.isDone).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
    
    const renderCard = (a) => {
        const s = clubSessions.find(x => x.id === a.sessionId); if(!s) return '';
        let assignerStr = '';
        if(a.assignerId) {
            const c = clubMembers.find(u=>u.id===a.assignerId);
            if(c) assignerStr = `<span style="font-size:0.75rem; background:#F1F5F9; color:var(--text-muted); padding:2px 6px; border-radius:4px; margin-left:8px;">Attribué par ${c.username}</span>`;
        }
        return `<div class="card interactive" onclick="openSessionAthlete('${a.id}')"><div class="card-header" style="align-items:center;"><span class="card-category">Entraînement</span>${a.isDone ? '<span class="status-badge status-done">Fait ✓</span>' : ''}</div><div class="card-title" style="font-size:1.25rem;">${s.name}</div><p style="font-size:0.95rem; color:var(--text-muted); margin:0;">🧗 ${s.blocks.length} exercices ${assignerStr}</p></div>`;
    };
    document.getElementById('classic-sessions-grid').innerHTML = todo.map(renderCard).join('') || "<p style='color:var(--text-muted); grid-column:1/-1; text-align:center; padding:3rem;'>Aucune séance en attente.</p>";
    document.getElementById('done-sessions-grid').innerHTML = done.map(renderCard).join('') || "<p style='color:var(--text-muted);'>Aucune séance réalisée.</p>";
}

function openSessionAthlete(assId) {
    viewedAssignmentId = assId; 
    const a = clubAssignments.find(x => x.id === assId); const s = clubSessions.find(x => x.id === a.sessionId);
    
    document.getElementById('view-session-title').textContent = s.name;
    document.getElementById('view-session-athlete-form').style.display = 'block';
    document.getElementById('view-session-coach-readonly').style.display = 'none';

    document.getElementById('session-annotation').value = a.annotation || '';
    document.getElementById('session-plaisir').value = a.plaisir || 5; document.getElementById('val-plaisir').textContent = a.plaisir || 5;
    document.getElementById('session-difficulte').value = a.difficulte || 5; document.getElementById('val-diff').textContent = a.difficulte || 5;
    document.getElementById('session-fatigue').value = a.fatigue || 5; document.getElementById('val-fatigue').textContent = a.fatigue || 5;
    
    resetTimer(); document.getElementById('chrono-container').style.display='none';

    document.getElementById('view-session-content-athlete').innerHTML = s.blocks.map((bId, i) => {
        const b = clubBlocks.find(x=>x.id===bId);
        let rpeHtml = '';
        if(b && b.category !== 'Débrief') {
            const blockRpeVal = (a.blockRpes && a.blockRpes[bId]) ? a.blockRpes[bId] : 5;
            rpeHtml = `<div style="margin-top:1rem; padding-top:1rem; border-top:1px dashed var(--border-color);">
                <label style="font-weight:700; color:var(--ffme-blue);">RPE pour cet exercice (1-10) : <b class="rpe-val-disp">${blockRpeVal}</b></label>
                <input type="range" class="block-rpe-slider rpe-slider" data-blockid="${bId}" min="1" max="10" value="${blockRpeVal}" oninput="this.previousElementSibling.querySelector('.rpe-val-disp').textContent=this.value">
            </div>`;
        }
        return b ? `<div style="padding:1.5rem; border:1px solid var(--border-color); border-left:4px solid var(--ffme-blue); border-radius:var(--radius-md); margin-bottom:1.25rem; background:var(--surface);">
                    <div class="card-category" style="margin-bottom:0.75rem;">${b.category}</div>
                    <div style="font-weight:800; font-size:1.2rem; margin-bottom:0.75rem;">${i+1}. ${b.title}</div>
                    <div style="white-space:pre-wrap; font-size:1rem; color:var(--text-muted);">${b.description}</div>
                    ${rpeHtml}
                </div>` : '';
    }).join('');
    
    const btn = document.getElementById('btn-validate-session');
    btn.textContent = a.isDone ? "Mettre à jour mon retour" : "✓ Marquer comme terminée";
    openModal('modal-view-session');
}

document.getElementById('btn-validate-session').onclick = async function() {
    const a = clubAssignments.find(x => x.id === viewedAssignmentId);
    const s = clubSessions.find(x => x.id === a.sessionId);
    const isFirstValidation = !a.isDone;
    
    a.isDone = true; 
    a.doneAt = a.doneAt || Date.now();
    a.annotation = document.getElementById('session-annotation').value.trim();
    a.plaisir = parseInt(document.getElementById('session-plaisir').value);
    a.difficulte = parseInt(document.getElementById('session-difficulte').value);
    a.fatigue = parseInt(document.getElementById('session-fatigue').value);
    
    a.blockRpes = {};
    let rpeTotal = 0; let rpeCount = 0;
    document.querySelectorAll('.block-rpe-slider').forEach(el => {
        const val = parseInt(el.value);
        a.blockRpes[el.dataset.blockid] = val;
        rpeTotal += val; rpeCount++;
    });
    a.avgRpe = rpeCount > 0 ? rpeTotal / rpeCount : 0;
    
    await db.collection('assignments').doc(a.id).update(a);

    if(isFirstValidation) {
        const myDones = clubAssignments.filter(x => x.athleteId === currentUser.id && x.isDone).sort((a,b) => b.doneAt - a.doneAt);
        let hardCount = 0;
        for(let i=0; i<Math.min(6, myDones.length); i++) { if(myDones[i].avgRpe >= 8) hardCount++; }
        
        const coach = clubMembers.find(u => u.role === 'coach');
        
        if(hardCount >= 3) {
            pushNotification(`🚨 Alerte Fatigue : <strong>${currentUser.username}</strong> a signalé 3 séances difficiles (RPE ≥ 8) récemment.`);
            if(coach && coach.profile.settings && !coach.profile.settings.autoMessageDisabled) {
                db.collection('messages').add({ clubId: currentUser.clubId, senderId: coach.id, receiverId: currentUser.id, text: "Je vois que récemment tes séances étaient difficiles, est ce que tu es fort fatigué(e) ou les séances sont-elles un peu trop difficiles ?", date: Date.now() });
            }
        }

        if(coach) {
            let shouldNotify = false;
            if(coach.profile && coach.profile.groups) {
                coach.profile.groups.forEach(g => { if(g.notify && g.athletes.includes(currentUser.id)) shouldNotify = true; });
            }
            
            if(shouldNotify) {
                const pendingCount = clubAssignments.filter(x => x.athleteId === currentUser.id && !x.isDone).length;
                pushNotification(`<strong>${currentUser.username}</strong> a terminé la séance <em>${s.name}</em>.`);
                if (pendingCount === 1) pushNotification(`Il ne reste plus qu'<strong>une seule séance</strong> en attente pour ${currentUser.username}.`);
                else if (pendingCount === 0) pushNotification(`<strong>${currentUser.username}</strong> a terminé toutes ses séances en attente !`);
            }
        }
    }
    closeModal('modal-view-session'); 
}

// --- ATHLETE PROFIL & AVATAR ---
function renderAthleteProfile() {
    document.getElementById('profile-display-name').textContent = currentUser.username;
    document.getElementById('profile-objectives').value = currentUser.profile.objectives || '';
    
    const pre = document.getElementById('profile-avatar-preview');
    const pla = document.getElementById('profile-avatar-placeholder');
    if (currentUser.profile.avatar) {
        pre.src = currentUser.profile.avatar; pre.style.display = 'block'; pla.style.display = 'none';
    } else { pre.style.display = 'none'; pla.style.display = 'block'; }

    const pCode = document.getElementById('profile-parent-code-display');
    if(currentUser.parentCode) { pCode.innerHTML = `<div class="parent-code-badge">Code Enfant : ${currentUser.parentCode}</div>`; pCode.style.display = 'block'; }
    else { pCode.style.display = 'none'; }
    
    const childrenList = document.getElementById('profile-linked-children-list');
    if(currentUser.linkedChildren && currentUser.linkedChildren.length > 0) {
        childrenList.innerHTML = "Enfants liés : " + currentUser.linkedChildren.map(cId => {
            const c = clubMembers.find(u=>u.id===cId); return c ? `<span style="background:var(--bg-color); padding:2px 6px; border-radius:4px; font-weight:600;">${c.username}</span>` : '';
        }).join('');
    } else { childrenList.innerHTML = ''; }

    document.getElementById('athlete-competitions-list').innerHTML = currentUser.profile.competitions.map(c => `<div class="comp-item"><b>${c.type}</b> - ${c.place}<br><span style="font-size:0.9rem; color:var(--text-muted);">${c.feeling}</span></div>`).join('') || "<p style='color:var(--text-muted);'>Aucune compétition enregistrée.</p>";

    renderRadarChart('chart-t1-athlete', currentUser.profile.skillsT1, "Technique & Gestuelle", 'rgba(0, 85, 164, 0.5)');
    renderRadarChart('chart-t2-athlete', currentUser.profile.skillsT2, "Physique & Mental", 'rgba(239, 65, 53, 0.5)');
    selectedUserIdForCalendar = currentUser.id; renderCalendar('athlete-calendar-container');
}
async function saveProfileObjectives() { 
    currentUser.profile.objectives = document.getElementById('profile-objectives').value.trim(); 
    await db.collection('users').doc(currentUser.id).update({ 'profile.objectives': currentUser.profile.objectives });
    alert("Objectifs sauvegardés."); 
}
        
function handleAvatarUpload(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const img = new Image();
        img.onload = async function() {
            const canvas = document.createElement('canvas'); const size = 250;
            canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size);
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2; const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
            currentUser.profile.avatar = canvas.toDataURL('image/jpeg', 0.8);
            
            await db.collection('users').doc(currentUser.id).update({ 'profile.avatar': currentUser.profile.avatar });
        }
        img.src = ev.target.result;
    }
    reader.readAsDataURL(file);
}

function openCompModal() { document.getElementById('comp-type').value=''; document.getElementById('comp-place').value=''; document.getElementById('comp-feeling').value=''; openModal('modal-competition'); }
async function saveCompetition() {
    const type = document.getElementById('comp-type').value.trim(); const place = document.getElementById('comp-place').value.trim(); const feeling = document.getElementById('comp-feeling').value.trim();
    if(!type) return;
    currentUser.profile.competitions.push({ type, place, feeling, date: Date.now() });
    await db.collection('users').doc(currentUser.id).update({ 'profile.competitions': currentUser.profile.competitions });
    closeModal('modal-competition'); 
}

// SKILLS
function openSkillsModal() {
    const buildRange = (themes, obj, containerId) => { document.getElementById(containerId).innerHTML = themes.map(t => `<div style="display:flex; flex-direction:column;"><label style="font-size:0.85rem; font-weight:600;">${t} (<b>${obj[t]||0}</b>)</label><input type="range" class="rpe-slider" min="0" max="10" value="${obj[t]||0}" oninput="this.previousElementSibling.querySelector('b').textContent = this.value" data-theme="${t}"></div>`).join(''); };
    buildRange(themes1, currentUser.profile.skillsT1, 'skills-form-t1'); buildRange(themes2, currentUser.profile.skillsT2, 'skills-form-t2'); openModal('modal-skills');
}
async function saveSkills() { 
    document.querySelectorAll('#skills-form-t1 input').forEach(inp => currentUser.profile.skillsT1[inp.dataset.theme] = parseInt(inp.value)); 
    document.querySelectorAll('#skills-form-t2 input').forEach(inp => currentUser.profile.skillsT2[inp.dataset.theme] = parseInt(inp.value)); 
    await db.collection('users').doc(currentUser.id).update({ 'profile.skillsT1': currentUser.profile.skillsT1, 'profile.skillsT2': currentUser.profile.skillsT2 });
    closeModal('modal-skills'); 
}
function renderRadarChart(canvasId, dataObj, label, color) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if(chartInstances[canvasId]) chartInstances[canvasId].destroy();
    chartInstances[canvasId] = new Chart(ctx, { type: 'radar', data: { labels: Object.keys(dataObj), datasets: [{ label, data: Object.values(dataObj), backgroundColor: color, borderColor: color.replace('0.5', '1'), borderWidth: 2 }] }, options: { scales: { r: { min: 0, max: 10, ticks: { display: false } } }, maintainAspectRatio: false }});
}

// CALENDAR
function renderCalendar(containerId) {
    const targetUser = clubMembers.find(x => x.id === selectedUserIdForCalendar);
    const cal = targetUser.profile.calendar || {};
    const dStr = (d) => `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const days = new Date(currentYear, currentMonth + 1, 0).getDate();
    let start = new Date(currentYear, currentMonth, 1).getDay(); start = start === 0 ? 6 : start - 1; 
    const today = new Date(); const isCurr = today.getMonth() === currentMonth && today.getFullYear() === currentYear;
    const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    let html = `<div class="calendar-header"><button class="btn-icon" style="background:var(--bg-color); border:1px solid var(--border-color);" onclick="changeMonth(-1, '${containerId}')">&lt;</button><h3 style="margin:0;">${months[currentMonth]} ${currentYear}</h3><button class="btn-icon" style="background:var(--bg-color); border:1px solid var(--border-color);" onclick="changeMonth(1, '${containerId}')">&gt;</button></div><div class="calendar-grid">` + ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => `<div class="calendar-day-name">${d}</div>`).join('');
    
    for(let i=0; i<start; i++) html += `<div></div>`;
    for(let d=1; d<=days; d++) {
        const data = cal[dStr(d)]; let cls = "calendar-day";
        if(isCurr && today.getDate() === d) cls += " today";
        if(data && data.active) cls += " active-day";
        let sHtml = '';
        if(data && data.assignmentId) {
            const assign = clubAssignments.find(a => a.id === data.assignmentId);
            if(assign) { const sess = clubSessions.find(s => s.id === assign.sessionId); if(sess) sHtml = `<div class="cal-session-indicator">${sess.name}</div>`; }
        }
        html += `<div class="${cls}" onclick="openCalNote('${dStr(d)}')"><span class="day-number">${d}</span>${sHtml}${data?.note ? '<div class="cal-note-indicator">'+data.note+'</div>' : ''}</div>`;
    }
    document.getElementById(containerId).innerHTML = html + `</div>`;
}
function changeMonth(delta, cid) { currentMonth += delta; if(currentMonth < 0) { currentMonth = 11; currentYear--; } if(currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(cid); }

function openCalNote(dateStr) {
    selectedDateForNote = dateStr; const targetUser = clubMembers.find(u => u.id === selectedUserIdForCalendar);
    const data = (targetUser.profile.calendar && targetUser.profile.calendar[dateStr]) || {};
    document.getElementById('cal-note-status').value = data.active ? "true" : "false"; document.getElementById('cal-note-text').value = data.note || '';
    const select = document.getElementById('cal-note-session'); 
    select.innerHTML = '<option value="">-- Aucune séance --</option>';
    const userAssignments = clubAssignments.filter(a => a.athleteId === targetUser.id);
    userAssignments.forEach(a => {
        if (a.isDone && a.id !== data.assignmentId) return; 
        const s = clubSessions.find(x => x.id === a.sessionId);
        if(s) select.innerHTML += `<option value="${a.id}" ${a.id === data.assignmentId ? 'selected' : ''}>${a.isDone?'[Validée] ':''}${s.name}</option>`; 
    });
    openModal('modal-calendar-note');
}
async function saveCalendarNote() {
    const u = clubMembers.find(x => x.id === selectedUserIdForCalendar);
    const isAct = document.getElementById('cal-note-status').value==="true"; const note = document.getElementById('cal-note-text').value.trim(); const assignId = document.getElementById('cal-note-session').value;
    if(!isAct && !note && !assignId) { delete u.profile.calendar[selectedDateForNote]; } 
    else { u.profile.calendar[selectedDateForNote] = { active: isAct, note: note, assignmentId: assignId || null }; }
    
    await db.collection('users').doc(u.id).update({ 'profile.calendar': u.profile.calendar });
    closeModal('modal-calendar-note'); 
}

// TIMER
let timerInterval = null; let timeRemaining = 0; let isWorkPhase = true; let currentRound = 1;
function updateTimerDisplay() { const m = Math.floor(timeRemaining/60).toString().padStart(2,'0'); const s = (timeRemaining%60).toString().padStart(2,'0'); document.getElementById('timer-display').textContent = `${m}:${s}`; }
function startTimer() {
    if(timerInterval) return; 
    const w = parseInt(document.getElementById('timer-work').value)||10; const r = parseInt(document.getElementById('timer-rest').value)||20; const totalRounds = parseInt(document.getElementById('timer-rounds').value)||5;
    if(timeRemaining === 0) { timeRemaining = w; isWorkPhase = true; currentRound = 1; }
    timerInterval = setInterval(() => {
        timeRemaining--;
        if(timeRemaining < 0) { if(isWorkPhase) { isWorkPhase = false; timeRemaining = r; } else { isWorkPhase = true; timeRemaining = w; currentRound++; if(currentRound > totalRounds) { resetTimer(); return alert("Terminé !"); } } }
        updateTimerDisplay();
    }, 1000);
}
function pauseTimer() { clearInterval(timerInterval); timerInterval = null; }
function resetTimer() { pauseTimer(); timeRemaining = 0; document.getElementById('timer-display').textContent = "00:00"; }

// --- MESSAGERIE CHAT ---
function toggleChatFullscreen() { document.getElementById('global-chat-panel').classList.toggle('fullscreen'); }
function toggleChat() {
    const p = document.getElementById('global-chat-panel');
    if(p.style.display === 'flex') { p.style.display = 'none'; return; }
    p.style.display = 'flex';
    showChatList();
}

function showChatList() {
    document.getElementById('chat-view-list').style.display = 'flex';
    document.getElementById('chat-view-conversation').style.display = 'none';
    document.getElementById('chat-back-btn').style.display = 'none';
    document.getElementById('chat-header-title').textContent = "Messagerie";

    const allUsers = clubMembers.filter(u => u.id !== currentUser.id);
    
    const annuaire = [...allUsers].sort((a,b) => {
        if(a.role === 'coach' && b.role !== 'coach') return -1;
        if(a.role !== 'coach' && b.role === 'coach') return 1;
        return a.username.localeCompare(b.username);
    });

    let recentsObj = {};
    clubMessages.forEach(m => {
        if(m.senderId === currentUser.id || m.receiverId === currentUser.id) {
            const otherId = m.senderId === currentUser.id ? m.receiverId : m.senderId;
            if(!recentsObj[otherId] || recentsObj[otherId].date < m.date) { recentsObj[otherId] = m; }
        }
    });
    const recentsArray = Object.values(recentsObj).sort((a,b) => b.date - a.date);

    const renderUser = (uId, lastMsgStr = '') => {
        const u = clubMembers.find(x=>x.id===uId); if(!u) return '';
        let avatar = u.profile.avatar ? `<img src="${u.profile.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '👤';
        return `<div class="chat-user-item" onclick="openConversation('${u.id}')">
                    <div class="avatar">${avatar}</div>
                    <div class="details"><span class="name">${u.username}</span><span class="role">${u.role}</span>${lastMsgStr ? `<span class="last-msg">${lastMsgStr}</span>` : ''}</div>
                </div>`;
    };

    document.getElementById('chat-recent-list').innerHTML = recentsArray.length ? recentsArray.map(m => {
        const otherId = m.senderId === currentUser.id ? m.receiverId : m.senderId;
        return renderUser(otherId, m.text);
    }).join('') : "<p style='padding:1rem; font-size:0.85rem; color:var(--text-muted); margin:0;'>Aucune conversation récente.</p>";

    document.getElementById('chat-annuaire-list').innerHTML = annuaire.map(u => renderUser(u.id)).join('');
}

function openConversation(targetId) {
    activeChatUserId = targetId; const targetUser = clubMembers.find(u=>u.id===targetId);
    document.getElementById('chat-view-list').style.display = 'none';
    document.getElementById('chat-view-conversation').style.display = 'flex';
    document.getElementById('chat-back-btn').style.display = 'block';
    document.getElementById('chat-header-title').textContent = targetUser.username;
    loadMessages();
}
        
function loadMessages() {
    if(!activeChatUserId) return;
    const container = document.getElementById('chat-messages-container'); 
    const msgs = clubMessages.filter(m => (m.senderId === currentUser.id && m.receiverId === activeChatUserId) || (m.senderId === activeChatUserId && m.receiverId === currentUser.id))
                             .sort((a,b) => a.date - b.date);
                             
    container.innerHTML = msgs.map(m => {
        const isMe = m.senderId === currentUser.id; const dateStr = new Date(m.date).toLocaleDateString('fr-FR', {hour:'2-digit', minute:'2-digit'});
        return `<div class="chat-msg ${isMe ? 'msg-me' : 'msg-them'}">${m.text}<span class="date">${dateStr}</span></div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const text = document.getElementById('chat-input-text').value.trim();
    if(!text || !activeChatUserId) return;
    db.collection('messages').add({ clubId: currentUser.clubId, senderId: currentUser.id, receiverId: activeChatUserId, text: text, date: Date.now() });
    document.getElementById('chat-input-text').value = ''; 
}

function openCoachSettingsModal() { 
    document.getElementById('coach-setting-automessage').checked = currentUser.profile.settings.autoMessageDisabled; 
    openModal('modal-coach-settings'); 
}

async function saveCoachSettings() { 
    currentUser.profile.settings.autoMessageDisabled = document.getElementById('coach-setting-automessage').checked; 
    await db.collection('users').doc(currentUser.id).update({ 'profile.settings': currentUser.profile.settings });
    closeModal('modal-coach-settings'); 
}

// Lancement Initial
initApp();
