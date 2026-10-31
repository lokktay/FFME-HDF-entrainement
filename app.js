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

// VARIABLES GLOBALES
let allClubs = [];
let clubMembers = [];
let clubBlocks = [];
let clubSessions = [];
let clubAssignments = [];
let clubMessages = [];
let clubNotifications = []; 
let clubRoleRequests = [];

let currentUser = null; 
let originalParentUser = null; 
let chartInstances = {}; 

let currentMonth = new Date().getMonth(); let currentYear = new Date().getFullYear();
let selectedDateForNote = null; let selectedUserIdForCalendar = null;
let editingBlockId = null; let editingSessionId = null; let builderBlocks = [];
let viewedAssignmentId = null; // Déclarée UNE SEULE FOIS ici
let currentSessionFilter = 'Toutes'; let coachBlockSearch = ''; let coachSessionSearch = ''; 
let coachBlockFilter = 'Toutes'; let currentSessionLibraryTab = 'personal'; 
let activeChatUserId = null; let editingGroupId = null; let editingCompIndex = null;
let groupEditorSelectedIds = new Set();
let groupEditorAvatar = null;
let groupAlertsUpdating = new Set();
let viewedGroupId = null;
let isRegistering = false; 
let athleteClubMemberSearch = '';
let athleteClubSessionSearch = '';

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

const appDialogQueue = [];
let activeAppDialog = null;
let appDialogPreviousFocus = null;

function alert(message) {
    appDialogQueue.push({ type: 'alert', message: String(message) });
    showNextAppDialog();
}

function showAppConfirm(message) {
    return new Promise(resolve => {
        appDialogQueue.push({ type: 'confirm', message: String(message), resolve });
        showNextAppDialog();
    });
}

function showNextAppDialog() {
    if(activeAppDialog || appDialogQueue.length === 0) return;
    const overlay = document.getElementById('app-dialog-overlay');
    if(!overlay) {
        const dialog = appDialogQueue.shift();
        if(dialog.resolve) dialog.resolve(false);
        else console.error("La fenêtre de notification n'est pas disponible.");
        showNextAppDialog();
        return;
    }

    activeAppDialog = appDialogQueue.shift();
    appDialogPreviousFocus = document.activeElement;
    const isConfirm = activeAppDialog.type === 'confirm';
    document.getElementById('app-dialog-title').textContent = isConfirm ? 'Confirmation' : 'Information';
    document.getElementById('app-dialog-icon').textContent = isConfirm ? '?' : 'ℹ';
    document.getElementById('app-dialog-message').textContent = activeAppDialog.message;
    document.getElementById('app-dialog-actions').innerHTML = isConfirm
        ? '<button class="btn-outline" type="button" onclick="finishAppDialog(false)">Annuler</button><button class="btn-primary" type="button" onclick="finishAppDialog(true)">Confirmer</button>'
        : '<button class="btn-primary" type="button" onclick="finishAppDialog(true)">OK</button>';
    overlay.style.display = 'flex';
    document.getElementById('app-dialog-actions').querySelector('button').focus();
}

function finishAppDialog(result) {
    if(!activeAppDialog) return;
    const completedDialog = activeAppDialog;
    activeAppDialog = null;
    document.getElementById('app-dialog-overlay').style.display = 'none';
    if(completedDialog.resolve) completedDialog.resolve(Boolean(result));
    if(appDialogPreviousFocus && typeof appDialogPreviousFocus.focus === 'function') appDialogPreviousFocus.focus();
    appDialogPreviousFocus = null;
    showNextAppDialog();
}

function handleAppDialogBackdrop(event) {
    if(event.target === event.currentTarget && activeAppDialog && activeAppDialog.type === 'alert') {
        finishAppDialog(true);
    }
}

document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && activeAppDialog) {
        event.preventDefault();
        finishAppDialog(activeAppDialog.type === 'alert');
    }
});

function getUserClubIds(user = currentUser) {
    if(!user) return [];
    const clubIds = Array.isArray(user.clubIds) ? [...user.clubIds] : [];
    if(user.clubId && !clubIds.includes(user.clubId)) clubIds.unshift(user.clubId);
    return [...new Set(clubIds)];
}

function getClubRole(user = currentUser, clubId = currentUser && currentUser.clubId) {
    if(!user || !clubId) return 'athlete';
    const club = allClubs.find(item => item.id === clubId);
    if(club && Array.isArray(club.managerIds) && club.managerIds.includes(user.id)) return 'gerant';
    if(user.clubRoles && user.clubRoles[clubId]) return user.clubRoles[clubId];
    const legacyCoachClubId = user.primaryClubId || user.clubId;
    return user.role === 'coach' && legacyCoachClubId === clubId ? 'coach' : 'athlete';
}

function hasCoachRights(user = currentUser, clubId = currentUser && currentUser.clubId) {
    const role = getClubRole(user, clubId);
    return role === 'coach' || role === 'gerant';
}

function isClubManager(user = currentUser, clubId = currentUser && currentUser.clubId) {
    return getClubRole(user, clubId) === 'gerant';
}

function canManageClubSession(session) {
    if(!currentUser || !session || session.clubId !== currentUser.clubId) return false;
    return isClubManager(currentUser, session.clubId) ||
        (hasCoachRights(currentUser, session.clubId) && session.authorId === currentUser.id);
}

function getRoleLabel(role) {
    return role === 'gerant' ? 'Gérant du club' : role === 'coach' ? 'Coach' : 'Athlète';
}

function getEmptyProfile() {
    let p = { objectives: '', avatar: null, skillsT1: {}, skillsT2: {}, calendar: {}, competitions: [], settings: { autoMessageDisabled: false }, groups: [] };
    themes1.forEach(t => p.skillsT1[t] = 0); themes2.forEach(t => p.skillsT2[t] = 0);
    return p;
}

function renderProfileClubs() {
    const clubsList = document.getElementById('profile-clubs-list');
    const clubSelect = document.getElementById('available-clubs-select');
    if(!clubsList || !clubSelect) return;

    const selectedClubId = clubSelect.value;
    const clubIds = getUserClubIds();
    const myClubs = clubIds.map(id => allClubs.find(club => club.id === id)).filter(Boolean);
    clubsList.innerHTML = myClubs.map(club => `
        <div class="club-membership-item">
            <div><strong>${escapeHtml(club.name)}</strong>${currentUser.clubId === club.id ? '<span class="club-current-badge">Club actif</span>' : ''}</div>
            <div class="club-membership-actions">
                ${currentUser.clubId !== club.id ? `<button class="btn-outline" onclick="setActiveClub('${escapeHtml(club.id)}')">Utiliser ce club</button>` : ''}
                <button class="btn-outline" style="color:var(--danger);" onclick="leaveClub('${escapeHtml(club.id)}')">Quitter</button>
            </div>
        </div>
    `).join('') || '<p style="color:var(--text-muted);">Vous n’êtes membre d’aucun club.</p>';

    const availableClubs = allClubs.filter(club => !clubIds.includes(club.id));
    clubSelect.innerHTML = '<option value="">Choisir un club</option>' +
        availableClubs.map(club => `<option value="${escapeHtml(club.id)}">${escapeHtml(club.name)}</option>`).join('') +
        '<option value="_new_">＋ Créer un nouveau club…</option>';
    if([...availableClubs, { id: '_new_' }].some(club => club.id === selectedClubId)) {
        clubSelect.value = selectedClubId;
    }
    handleAvailableClubChange();
}

function handleAvailableClubChange() {
    const clubSelect = document.getElementById('available-clubs-select');
    const joinButton = document.getElementById('join-club-submit');
    const createControls = document.getElementById('create-club-controls');
    if(!clubSelect || !joinButton || !createControls) return;

    const creatingClub = clubSelect.value === '_new_';
    joinButton.style.display = creatingClub ? 'none' : '';
    createControls.style.display = creatingClub ? 'flex' : 'none';
}

function renderMyRoleRequests() {
    const section = document.getElementById('role-request-section');
    const status = document.getElementById('role-request-status');
    const submit = document.getElementById('role-request-submit');
    if(!section || !status || !submit) return;

    section.style.display = isClubManager() || !currentUser.clubId ? 'none' : 'block';
    const pending = clubRoleRequests.find(request => request.status === 'pending');
    if(pending) {
        status.textContent = `Demande en attente pour le rôle « ${getRoleLabel(pending.requestedRole)} ».`;
        submit.disabled = true;
    } else {
        const latest = [...clubRoleRequests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        status.textContent = latest
            ? `Dernière demande : ${getRoleLabel(latest.requestedRole)} — ${latest.status === 'approved' ? 'acceptée' : latest.status === 'rejected' ? 'refusée' : 'en attente'}.`
            : '';
        submit.disabled = false;
    }
}

async function submitRoleRequest() {
    if(!currentUser.clubId || isClubManager()) return;
    const requestedRole = document.getElementById('role-request-select').value;
    if(!['coach', 'gerant'].includes(requestedRole)) return alert("Sélectionnez un rôle valide.");
    if(clubRoleRequests.some(request => request.status === 'pending')) {
        return alert("Vous avez déjà une demande de rôle en attente pour ce club.");
    }

    try {
        await db.collection('roleRequests').add({
            clubId: currentUser.clubId,
            requesterId: currentUser.id,
            requesterName: currentUser.username,
            requestedRole,
            status: 'pending',
            createdAt: Date.now()
        });
        alert("Votre demande a été envoyée aux gérants du club.");
    } catch(error) {
        console.error("Erreur d'envoi de demande de rôle:", error);
        alert("Impossible d'envoyer votre demande : " + error.message);
    }
}

async function updateClubMemberRole(memberId) {
    if(!isClubManager()) return alert("Seul un gérant peut modifier les rôles du club.");
    memberId = memberId || viewedAthleteId;
    const member = clubMembers.find(user => user.id === memberId);
    const select = document.getElementById('view-athlete-role');
    const role = select && select.value;
    if(!member || !['athlete', 'coach', 'gerant'].includes(role)) return alert("Membre ou rôle invalide.");

    const oldRole = getClubRole(member, currentUser.clubId);
    if(memberId === currentUser.id && oldRole === 'gerant' && role !== 'gerant') {
        return alert("Vous ne pouvez pas retirer votre propre rôle de gérant ici.");
    }
    if(oldRole === 'gerant' && role !== 'gerant') {
        const managers = clubMembers.filter(user => getClubRole(user, currentUser.clubId) === 'gerant');
        if(managers.length <= 1) return alert("Le club doit conserver au moins un gérant.");
    }

    try {
        const batch = db.batch();
        const userRef = db.collection('users').doc(memberId);
        batch.update(userRef, { [`clubRoles.${currentUser.clubId}`]: role });
        if(role === 'gerant') {
            batch.update(db.collection('clubs').doc(currentUser.clubId), {
                managerIds: firebase.firestore.FieldValue.arrayUnion(currentUser.id, memberId)
            });
        } else if(oldRole === 'gerant') {
            const managerIds = [...new Set([...(getMyClubObj().managerIds || []), currentUser.id])]
                .filter(id => id !== memberId);
            batch.update(db.collection('clubs').doc(currentUser.clubId), {
                managerIds
            });
        }
        await batch.commit();
        alert(`Rôle de ${member.username} mis à jour : ${getRoleLabel(role)}.`);
    } catch(error) {
        console.error("Erreur de modification du rôle:", error);
        alert("Impossible de modifier ce rôle : " + error.message);
    }
}

async function resolveRoleRequest(requestId, status) {
    if(!isClubManager() || !['approved', 'rejected'].includes(status)) return;
    const request = clubRoleRequests.find(item => item.id === requestId && item.status === 'pending');
    if(!request) return alert("Cette demande n'est plus en attente.");

    try {
        const batch = db.batch();
        if(status === 'approved') {
            if(!['coach', 'gerant'].includes(request.requestedRole)) return alert("Le rôle demandé n'est pas valide.");
            const member = clubMembers.find(user => user.id === request.requesterId);
            if(!member || !getUserClubIds(member).includes(currentUser.clubId)) {
                return alert("Ce membre ne fait plus partie du club.");
            }
            batch.update(db.collection('users').doc(member.id), {
                [`clubRoles.${currentUser.clubId}`]: request.requestedRole
            });
            if(request.requestedRole === 'gerant') {
                batch.update(db.collection('clubs').doc(currentUser.clubId), {
                    managerIds: firebase.firestore.FieldValue.arrayUnion(currentUser.id, member.id)
                });
            }
        }
        batch.update(db.collection('roleRequests').doc(requestId), {
            status,
            resolvedAt: Date.now(),
            resolvedBy: currentUser.id
        });
        await batch.commit();
    } catch(error) {
        console.error("Erreur de traitement de demande de rôle:", error);
        alert("Impossible de traiter la demande : " + error.message);
    }
}

async function setActiveClub(clubId) {
    if(!getUserClubIds().includes(clubId)) return alert("Vous n'êtes pas membre de ce club.");
    try {
        await db.collection('users').doc(currentUser.id).update({ clubId });
        currentUser.clubId = clubId;
        startRealtimeListeners(clubId);
        showApp();
    } catch(error) {
        console.error("Erreur changement de club actif:", error);
        alert("Impossible de changer de club : " + error.message);
    }
}

async function joinClub() {
    const clubId = document.getElementById('available-clubs-select').value;
    if(!clubId) return alert("Sélectionnez un club.");
    if(clubId === '_new_') return;
    const clubIds = getUserClubIds();
    if(clubIds.includes(clubId)) return alert("Vous êtes déjà membre de ce club.");
    clubIds.push(clubId);
    const updates = { clubIds };
    if(!currentUser.clubId) updates.clubId = clubId;
    try {
        await db.collection('users').doc(currentUser.id).update(updates);
        currentUser.clubIds = clubIds;
        if(!currentUser.clubId) {
            currentUser.clubId = clubId;
            startRealtimeListeners(clubId);
            showApp();
        } else {
            renderProfileClubs();
        }
        document.getElementById('available-clubs-select').value = '';
    } catch(error) {
        console.error("Erreur adhésion au club:", error);
        alert("Impossible de rejoindre ce club : " + error.message);
    }
}

async function createClub() {
    const nameInput = document.getElementById('new-club-name');
    const name = nameInput.value.trim();
    if(!name) return alert("Saisissez le nom du club.");
    if(name.length > 80) return alert("Le nom du club ne peut pas dépasser 80 caractères.");
    const normalizedName = name.toLocaleLowerCase('fr-FR');
    if(allClubs.some(club => String(club.name || '').trim().toLocaleLowerCase('fr-FR') === normalizedName)) {
        return alert("Un club portant ce nom existe déjà.");
    }

    const submitButton = document.getElementById('create-club-submit');
    if(submitButton.disabled) return;
    submitButton.disabled = true;
    try {
        const clubRef = db.collection('clubs').doc();
        const club = {
            id: clubRef.id,
            name,
            categories: defaultCategories,
            managerIds: [currentUser.id]
        };
        const clubIds = [...new Set([...getUserClubIds(), club.id])];
        const batch = db.batch();
        batch.set(clubRef, club);
        batch.update(db.collection('users').doc(currentUser.id), { clubIds, clubId: club.id });
        await batch.commit();
        allClubs = [...allClubs.filter(item => item.id !== club.id), club];
        currentUser.clubIds = clubIds;
        currentUser.clubId = club.id;
        nameInput.value = '';
        startRealtimeListeners(club.id);
        showApp();
        alert(`Le club « ${name} » a été créé. Vous en êtes le gérant.`);
    } catch(error) {
        console.error("Erreur de création du club:", error);
        alert("Impossible de créer le club : " + error.message);
    } finally {
        submitButton.disabled = false;
    }
}

async function leaveClub(clubId) {
    const club = allClubs.find(item => item.id === clubId);
    const managers = clubMembers.filter(user => isClubManager(user, clubId));
    if(isClubManager(currentUser, clubId) && managers.length <= 1) {
        return alert("Vous êtes le seul gérant de ce club. Nommez d'abord un autre gérant avant de le quitter.");
    }
    if(!await showAppConfirm(`Quitter le club « ${club ? club.name : 'sélectionné'} » ? Vos séances et votre historique dans ce club ne seront plus accessibles.`)) return;
    const wasActiveClub = currentUser.clubId === clubId;
    const clubIds = getUserClubIds().filter(id => id !== clubId);
    const nextClubId = wasActiveClub ? (clubIds[0] || null) : currentUser.clubId;
    try {
        await db.collection('users').doc(currentUser.id).update({ clubIds, clubId: nextClubId });
        currentUser.clubIds = clubIds;
        currentUser.clubId = nextClubId;
        if(wasActiveClub) {
            startRealtimeListeners(nextClubId);
        }
        if(wasActiveClub && nextClubId) showApp();
        else if(wasActiveClub) switchTab('athlete-profile');
        renderProfileClubs();
    } catch(error) {
        console.error("Erreur départ du club:", error);
        alert("Impossible de quitter ce club : " + error.message);
    }
}

// === INITIALISATION ET ÉCOUTEURS TEMPS RÉEL ===
function initApp() {
    db.collection('clubs').onSnapshot(snap => {
        allClubs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if(document.getElementById('auth-screen').style.display !== 'none') updateAuthClubList();
        else refreshCurrentTab();
    });

   auth.onAuthStateChanged(async user => {
        if (isRegistering) return; 

        if (user) {
            try {
                if (user.emailVerified) {
                    const uSnap = await db.collection('users').doc(user.uid).get();
                    
                    if (uSnap.exists) {
                        currentUser = uSnap.data();
                        const activeClubId = currentUser.clubId || getUserClubIds(currentUser)[0] || null;
                        if(currentUser.clubId && !currentUser.primaryClubId) {
                            currentUser.primaryClubId = currentUser.clubId;
                            await db.collection('users').doc(currentUser.id).update({ primaryClubId: currentUser.clubId });
                        }
                        if(activeClubId && currentUser.clubId !== activeClubId) {
                            currentUser.clubId = activeClubId;
                            await db.collection('users').doc(currentUser.id).update({ clubId: activeClubId });
                        }
                        startRealtimeListeners(activeClubId); 
                        document.getElementById('loader-screen').style.display = 'none';
                        showApp();
                    } else {
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
                document.getElementById('loader-screen').style.display = 'none';
                await auth.signOut();
                alert("Erreur de synchronisation : " + error.message);
                initAuthUI();
            }
        } else {
            stopRealtimeListeners();
            currentUser = null;
            originalParentUser = null;
            document.getElementById('loader-screen').style.display = 'none';
            initAuthUI();
        }
    });
}

let listeners = [];
let realtimeListenerGeneration = 0;

function stopRealtimeListeners() {
    realtimeListenerGeneration++;
    listeners.forEach(unsubscribe => unsubscribe());
    listeners = [];
}

function handleRealtimeListenerError(label, generation, error) {
    if(generation !== realtimeListenerGeneration || !auth.currentUser) return;
    console.error(`Erreur de synchronisation ${label}:`, error);
    alert(`Impossible de charger ${label} : ${error.message}`);
}

async function loadAssignedAthleteSessions(assignments, clubId, generation) {
    if(!currentUser || hasCoachRights(currentUser, clubId)) return;
    const loadedIds = new Set(clubSessions.map(session => session.id));
    const missingIds = [...new Set(assignments
        .filter(assignment => assignment.athleteId === currentUser.id && !assignment.sessionSnapshot)
        .map(assignment => assignment.sessionId)
        .filter(sessionId => sessionId && !loadedIds.has(sessionId)))];
    if(missingIds.length === 0) return;

    try {
        const sessions = await Promise.all(missingIds.map(async sessionId => {
            const snapshot = await db.collection('sessions').doc(sessionId).get();
            return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
        }));
        if(generation !== realtimeListenerGeneration || !auth.currentUser) return;
        const byId = new Map(clubSessions.map(session => [session.id, session]));
        sessions.filter(session => session && session.clubId === clubId)
            .forEach(session => byId.set(session.id, session));
        clubSessions = [...byId.values()];
        refreshCurrentTab();
    } catch(error) {
        handleRealtimeListenerError("les détails de vos séances attribuées", generation, error);
    }
}

function startRealtimeListeners(clubId) {
    stopRealtimeListeners();
    const listenerGeneration = realtimeListenerGeneration;
    clubMembers = [];
    clubBlocks = [];
    clubSessions = [];
    clubAssignments = [];
    clubMessages = [];
    clubNotifications = [];
    clubRoleRequests = [];

    if(!clubId) {
        clubMembers = [];
        refreshCurrentTab();
        return;
    }

    let legacyMembers = [];
    let multiClubMembers = [];
    const updateClubMembers = () => {
        if(listenerGeneration !== realtimeListenerGeneration || !currentUser || !auth.currentUser) return;
        const membersById = new Map([...legacyMembers, ...multiClubMembers].map(member => [member.id, member]));
        if(currentUser && !membersById.has(currentUser.id)) membersById.set(currentUser.id, currentUser);
        clubMembers = [...membersById.values()];
        const updatedMe = clubMembers.find(u => u.id === currentUser.id);
        if(updatedMe && !originalParentUser) currentUser = updatedMe;
        refreshCurrentTab();
    };

    listeners.push(db.collection('users').where('clubId', '==', clubId).onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        legacyMembers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        updateClubMembers();
    }, error => handleRealtimeListenerError("les membres du club", listenerGeneration, error)));
    listeners.push(db.collection('users').where('clubIds', 'array-contains', clubId).onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        multiClubMembers = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        updateClubMembers();
    }, error => handleRealtimeListenerError("les membres du club", listenerGeneration, error)));

    if(hasCoachRights(currentUser, clubId)) {
        listeners.push(db.collection('blocks').where('clubId', '==', clubId).onSnapshot(snap => {
            if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
            clubBlocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            refreshCurrentTab();
        }, error => handleRealtimeListenerError("les exercices du club", listenerGeneration, error)));
    }

    let sessionsQuery = db.collection('sessions').where('clubId', '==', clubId);
    if(!hasCoachRights(currentUser, clubId)) sessionsQuery = sessionsQuery.where('isShared', '==', true);
    listeners.push(sessionsQuery.onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        const sessionsById = new Map(clubSessions.map(session => [session.id, session]));
        snap.docs.forEach(doc => sessionsById.set(doc.id, { id: doc.id, ...doc.data() }));
        clubSessions = [...sessionsById.values()];
        refreshCurrentTab();
    }, error => handleRealtimeListenerError("les séances du club", listenerGeneration, error)));

    let assignmentsQuery = db.collection('assignments').where('clubId', '==', clubId);
    if(!hasCoachRights(currentUser, clubId)) assignmentsQuery = assignmentsQuery.where('athleteId', '==', currentUser.id);
    listeners.push(assignmentsQuery.onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        clubAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        refreshCurrentTab();
        loadAssignedAthleteSessions(clubAssignments, clubId, listenerGeneration);
    }, error => handleRealtimeListenerError("vos attributions de séances", listenerGeneration, error)));

    let sentMessages = [];
    let receivedMessages = [];
    const updateClubMessages = () => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        const messagesById = new Map([...sentMessages, ...receivedMessages].map(message => [message.id, message]));
        clubMessages = [...messagesById.values()];
        if(document.getElementById('global-chat-panel').style.display === 'flex') {
            if(document.getElementById('chat-view-list').style.display === 'flex') showChatList();
            else loadMessages();
        }
    };
    listeners.push(db.collection('messages').where('clubId', '==', clubId)
        .where('senderId', '==', currentUser.id).onSnapshot(snap => {
            sentMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateClubMessages();
        }, error => handleRealtimeListenerError("vos messages envoyés", listenerGeneration, error)));
    listeners.push(db.collection('messages').where('clubId', '==', clubId)
        .where('receiverId', '==', currentUser.id).onSnapshot(snap => {
            receivedMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            updateClubMessages();
        }, error => handleRealtimeListenerError("vos messages reçus", listenerGeneration, error)));

    if(hasCoachRights(currentUser, clubId)) {
        listeners.push(db.collection('notifications').where('clubId', '==', clubId)
            .orderBy('timestamp', 'desc').limit(50).onSnapshot(snap => {
                if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
                clubNotifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                refreshCurrentTab();
            }, error => handleRealtimeListenerError("les notifications du club", listenerGeneration, error)));
    }

    const roleRequestQuery = isClubManager(currentUser, clubId)
        ? db.collection('roleRequests').where('clubId', '==', clubId)
        : db.collection('roleRequests').where('requesterId', '==', currentUser.id);
    listeners.push(roleRequestQuery.onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        clubRoleRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(request => request.clubId === clubId);
        refreshCurrentTab();
    }, error => {
        handleRealtimeListenerError("les demandes de rôle", listenerGeneration, error);
    }));
}

function refreshCurrentTab() {
    if(document.getElementById('coach-dashboard-space').classList.contains('active')) renderCoachDashboard();
    if(document.getElementById('coach-athletes-space').classList.contains('active')) renderCoachAthletes();
    if(document.getElementById('athlete-sessions-space').classList.contains('active')) renderAthleteSessions();
    if(document.getElementById('athlete-club-members-space').classList.contains('active')) renderAthleteClubMembers();
    if(document.getElementById('athlete-club-sessions-space').classList.contains('active')) renderAthleteClubSessions();
    if(document.getElementById('athlete-profile-space').classList.contains('active')) renderAthleteProfile();
    const athleteProfileModal = document.getElementById('modal-view-athlete');
    if(athleteProfileModal && athleteProfileModal.style.display === 'flex' &&
       document.getElementById('coach-ath-view-historique').style.display !== 'none') {
        renderCoachAthleteHistory();
    }
}

function updateAuthClubList() {
    const select = document.getElementById('reg-club');
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Choisir un club --</option>';
    allClubs.forEach(c => select.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`);
    select.innerHTML += `<option value="_new_" style="font-weight:700; color:var(--ffme-blue-dark);">➕ Créer un nouveau club...</option>`;
    if(currentVal) select.value = currentVal;
}

function renderFilterTags(containerId, categories, activeCategory, onSelect) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.replaceChildren();
    ['Toutes', ...categories].forEach(category => {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = `filter-tag${activeCategory === category ? ' active' : ''}`;
        tag.textContent = category;
        tag.addEventListener('click', () => onSelect(category));
        container.appendChild(tag);
    });
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
    const role = 'athlete';
    let clubId = document.getElementById('reg-club').value;

    if (!email || !password || !username || !dob) return alert("Veuillez remplir tous les champs.");
    
    let newClubName = '';
    if (clubId === '_new_') {
        newClubName = document.getElementById('reg-new-club').value.trim();
        if (!newClubName) return alert("Nom du club requis.");
        clubId = 'club_' + Date.now();
    } else if (!clubId) return alert("Sélectionnez un club.");

    document.getElementById('loader-screen').style.display = 'flex';
    isRegistering = true; 

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const isCreatingClub = document.getElementById('reg-club').value === '_new_';
        if (isCreatingClub) {
            await db.collection('clubs').doc(clubId).set({
                id: clubId,
                name: newClubName,
                categories: defaultCategories,
                managerIds: [user.uid]
            });
        }

        const age = (new Date() - new Date(dob)) / (1000*60*60*24*365.25);
        const parentCode = age < 18 ? Math.floor(10000 + Math.random() * 90000).toString() : null;

        const newUser = {
            id: user.uid,
            email: email,
            username,
            role,
            clubId,
            clubIds: [clubId],
            primaryClubId: clubId,
            clubRoles: { [clubId]: isCreatingClub ? 'gerant' : 'athlete' },
            dob,
            parentCode,
            linkedChildren: [],
            profile: getEmptyProfile()
        };
        
        if(age >= 18) {
            const code = document.getElementById('reg-link-code').value.trim();
            if(code) {
                const childSnap = await db.collection('users').where('parentCode', '==', code).get();
                if(!childSnap.empty) newUser.linkedChildren.push(childSnap.docs[0].id);
            }
        }
        
        await db.collection('users').doc(newUser.id).set(newUser);
        
        await user.sendEmailVerification();
        await auth.signOut();
        isRegistering = false; 
        
        document.getElementById('loader-screen').style.display = 'none';
        alert("Compte créé avec succès ! Un email de vérification vous a été envoyé. Veuillez cliquer sur le lien avant de vous connecter.");
        switchAuthTab('login');
    } catch (error) {
        isRegistering = false; 
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

async function logout() {
    stopRealtimeListeners();
    try {
        await auth.signOut();
        currentUser = null;
        originalParentUser = null;
        initAuthUI();
    } catch(error) {
        console.error("Erreur de déconnexion:", error);
        if(currentUser && currentUser.clubId) startRealtimeListeners(currentUser.clubId);
        alert("Impossible de vous déconnecter : " + error.message);
    }
}

// === COMPTES LIES ===
function toggleAccountMenu() {
    const dd = document.getElementById('account-dropdown'); const realUser = originalParentUser || currentUser;
    if(realUser.linkedChildren.length === 0 && !originalParentUser) return;
    if(dd.style.display === 'block') { dd.style.display = 'none'; return; }
    let html = '';
    if(originalParentUser) html += `<button onclick="switchAccount('${escapeHtml(originalParentUser.id)}')">↩ Retour Parent (${escapeHtml(originalParentUser.username)})</button>`;
    realUser.linkedChildren.forEach(cId => {
        const c = clubMembers.find(u=>u.id===cId);
        if(c && c.id !== currentUser.id) html += `<button onclick="switchAccount('${escapeHtml(c.id)}')">👶 Basculer vers ${escapeHtml(c.username)}</button>`;
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
    
    const activeRole = getClubRole();
    let userText = `👤 ${escapeHtml(currentUser.username)} <span style="opacity:0.7; font-size:0.8rem; margin-left:4px;">(${getRoleLabel(activeRole)})</span>`;
    if(originalParentUser) userText += ` <span style="font-size:0.75rem; background:var(--primary); color:white; padding:2px 6px; border-radius:4px; margin-left:8px; font-weight:700;">Vue Enfant</span>`;
    document.getElementById('header-user-info-text').innerHTML = userText;
    
    const coachTabs = document.querySelectorAll('.coach-only');
    if (hasCoachRights()) {
        coachTabs.forEach(el => el.style.display = 'inline-block');
        document.querySelectorAll('.athlete-only').forEach(el => el.style.display = 'none');
        switchTab('coach-dashboard');
        updateCategorySelect();
    } else {
        coachTabs.forEach(el => el.style.display = 'none');
        document.querySelectorAll('.athlete-only').forEach(el => el.style.display = 'inline-block');
        switchTab('athlete-sessions');
    }
    if(!currentUser.clubId) switchTab('athlete-profile');
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
    const notif = {
        id: 'notif_' + Date.now(),
        clubId: currentUser.clubId,
        createdBy: currentUser.id,
        text,
        date: new Date().toLocaleDateString('fr-FR', { hour: '2-digit', minute:'2-digit' }),
        timestamp: Date.now()
    };
    db.collection('notifications').doc(notif.id).set(notif);
}
function renderNotifications() {
    const panel = document.getElementById('coach-notifications');
    const list = document.getElementById('notifications-list');
    const allList = document.getElementById('all-notifications-list');
    const roleRequests = isClubManager() ? clubRoleRequests.filter(request => request.status === 'pending') : [];
    const requestHtml = roleRequests.map(request => `
        <div class="notif-item role-request-item">
            <div><strong>Demande de rôle de ${escapeHtml(request.requesterName)}</strong><br>
                <span>${getRoleLabel(request.requestedRole)} · ${new Date(request.createdAt || Date.now()).toLocaleString('fr-FR')}</span>
            </div>
            <div class="club-membership-actions">
                <button class="btn-primary" onclick="resolveRoleRequest('${request.id}', 'approved')">Accorder</button>
                <button class="btn-outline" onclick="resolveRoleRequest('${request.id}', 'rejected')">Refuser</button>
            </div>
        </div>
    `).join('');
    const hasNotifications = clubNotifications && clubNotifications.length > 0;

    if(hasNotifications || requestHtml) {
        panel.style.display = 'block';
        list.innerHTML = requestHtml + (hasNotifications ? clubNotifications.slice(0, 3).map(n => `<div class="notif-item"><span class="notif-date">${escapeHtml(n.date)}</span> <span>${escapeHtml(n.text)}</span></div>`).join('') : '');
        allList.innerHTML = requestHtml + (hasNotifications ? clubNotifications.map(n => `<div class="notif-item"><span class="notif-date">${escapeHtml(n.date)}</span> <span>${escapeHtml(n.text)}</span></div>`).join('') : '');
    } else {
        panel.style.display = 'none';
        allList.innerHTML = "<p>Aucune notification.</p>";
    }
}

// === COACH : DASHBOARD / BUILDER ===
function getMyClubObj() { return allClubs.find(c => c.id === currentUser.clubId) || { id: currentUser.clubId, name: currentUser.clubId ? 'Mon club' : 'Aucun club', categories: defaultCategories }; }

function updateCategorySelect() {
    const select = document.getElementById('block-category');
    select.innerHTML = '';
    getMyClubObj().categories.forEach(cat => select.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`);
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

function getMyBlocks() {
    return clubBlocks.filter(b => b.userId === currentUser.id || b.authorId === currentUser.id || (!b.userId && !b.authorId));
}

function openCreateBlock() { editingBlockId = null; document.getElementById('modal-block-title-text').textContent = "Créer un Bloc"; document.getElementById('block-title').value = ''; document.getElementById('block-desc').value = ''; openModal('modal-create-block'); }
function openEditBlock(id) {
    editingBlockId = id; const b = clubBlocks.find(x => x.id === id);
    document.getElementById('modal-block-title-text').textContent = "Modifier le Bloc";
    document.getElementById('block-category').value = b.category; document.getElementById('block-title').value = b.title; document.getElementById('block-desc').value = b.description;
    openModal('modal-create-block');
}
async function deleteBlock(id) {
    if(!id) return;
    if(!await showAppConfirm("Êtes-vous sûr de vouloir supprimer ce bloc définitivement ?")) return;
    try {
        await db.collection('blocks').doc(id).delete();
        clubBlocks = clubBlocks.filter(b => b.id !== id);
        renderCoachDashboard();
        if (document.getElementById('modal-create-session').style.display === 'flex') updateBuilderBlocksList();
    } catch(e) {
        console.error("Erreur suppression bloc:", e);
        alert("Impossible de supprimer le bloc : " + e.message);
    }
}

async function saveBlock() {
    const title = document.getElementById('block-title').value.trim(); 
    const desc = document.getElementById('block-desc').value.trim(); 
    const cat = document.getElementById('block-category').value;
    if (!title || cat === '_new_') return alert("Veuillez remplir le titre et la catégorie.");
    
    let blockData = { 
        title, 
        category: cat, 
        description: desc, 
        clubId: currentUser.clubId,
        userId: currentUser.id,
        authorId: currentUser.id
    };
    try {
        if (editingBlockId) {
            await db.collection('blocks').doc(editingBlockId).update(blockData);
        } else {
            blockData.id = 'blk_' + Date.now();
            await db.collection('blocks').doc(blockData.id).set(blockData);
        }
        closeModal('modal-create-block');
        if (document.getElementById('modal-create-session').style.display === 'flex') updateBuilderBlocksList();
        renderCoachDashboard();
    } catch(e) {
        console.error("Erreur sauvegarde bloc:", e);
        alert("Erreur lors de l'enregistrement du bloc : " + e.message);
    }
}

// BUILDER SÉANCE
function openSessionBuilder() { editingSessionId = null; builderBlocks = []; currentSessionFilter = 'Toutes'; document.getElementById('modal-session-title-text').textContent = "Créer une Séance"; document.getElementById('session-name').value = ''; buildFilters(); updateBuilderBlocksList(); updateBuilderSeq(); openModal('modal-create-session'); }
function buildFilters() {
    renderFilterTags('builder-filters', getMyClubObj().categories, currentSessionFilter, setBuilderFilter);
}
function setBuilderFilter(cat) { currentSessionFilter = cat; buildFilters(); updateBuilderBlocksList(); }
function updateBuilderBlocksList() {
    const myBlocks = getMyBlocks();
    const filtered = currentSessionFilter === 'Toutes' ? myBlocks : myBlocks.filter(b => b.category === currentSessionFilter);
    document.getElementById('builder-blocks-list').innerHTML = filtered.map(b => `<div style="background:var(--surface); border:1px solid var(--border-color); padding:1rem; border-radius:var(--radius-md); cursor:pointer;" onclick="addBlockToBuilder('${escapeHtml(b.id)}')"><div style="font-size:0.75rem; color:var(--ffme-blue); font-weight:800; text-transform:uppercase;">${escapeHtml(b.category)}</div><div style="font-weight:700;">${escapeHtml(b.title)}</div></div>`).join('') || "<p style='color:var(--text-muted); font-size:0.85rem; padding:1rem;'>Aucun bloc personnel disponible.</p>";
}
async function saveSession() {
    const name = document.getElementById('session-name').value.trim();
    if(!name || builderBlocks.length===0) return;

    const sessionData = { name, blocks: builderBlocks, clubId: currentUser.clubId };
    try {
        if(editingSessionId) {
            const existingSession = clubSessions.find(session => session.id === editingSessionId);
            if(!canManageClubSession(existingSession)) {
                alert("Seul le coach qui a partagé cette séance ou un gérant du club peut la modifier.");
                return;
            }
            if(existingSession.isShared) {
                sessionData.blockSnapshots = await getClubSessionBlockSnapshots({
                    ...existingSession,
                    blocks: builderBlocks,
                    blockSnapshots: null
                });
            }
            await db.collection('sessions').doc(editingSessionId).update(sessionData);
        } else {
            sessionData.id = 'sess_' + Date.now();
            sessionData.authorId = currentUser.id;
            sessionData.isShared = false;
            await db.collection('sessions').doc(sessionData.id).set(sessionData);
        }
        closeModal('modal-create-session');
        setSessionLibraryTab('personal');
    } catch(error) {
        console.error("Erreur d'enregistrement de la séance:", error);
        alert("Impossible d'enregistrer la séance : " + error.message);
    }
}

async function createAssignedSessionSnapshot(session) {
    const blocks = await Promise.all((session.blocks || []).map(async blockId => {
        let block = clubBlocks.find(item => item.id === blockId);
        if(!block) {
            const blockSnap = await db.collection('blocks').doc(blockId).get();
            if(blockSnap.exists) block = { id: blockSnap.id, ...blockSnap.data() };
        }
        if(!block) throw new Error(`L'exercice ${blockId} n'est plus disponible.`);
        return {
            id: block.id,
            category: block.category || '',
            title: block.title || '',
            description: block.description || ''
        };
    }));

    return {
        id: session.id,
        name: session.name || '',
        clubId: session.clubId || currentUser.clubId,
        authorId: session.authorId || '',
        isShared: Boolean(session.isShared),
        blocks
    };
}

function getAssignmentSession(assignment) {
    if(!assignment) return null;
    return assignment.sessionSnapshot ||
        clubSessions.find(session => session.id === assignment.sessionId) || null;
}

function getAssignmentBlocks(assignment, session) {
    if(assignment && assignment.sessionSnapshot && Array.isArray(assignment.sessionSnapshot.blocks)) {
        return assignment.sessionSnapshot.blocks;
    }
    return session && Array.isArray(session.blocks)
        ? session.blocks.map(blockId => clubBlocks.find(block => block.id === blockId)).filter(Boolean)
        : [];
}

async function getClubSessionBlockSnapshots(session) {
    if(Array.isArray(session.blockSnapshots) && session.blockSnapshots.length === (session.blocks || []).length) {
        return session.blockSnapshots;
    }
    return Promise.all((session.blocks || []).map(async (blockReference, index) => {
        if(blockReference && typeof blockReference === 'object') {
            return {
                id: blockReference.id || `block-${index}`,
                category: blockReference.category || '',
                title: blockReference.title || '',
                description: blockReference.description || ''
            };
        }

        const blockId = blockReference;
        const cachedBlock = clubBlocks.find(block => block.id === blockId);
        let block = cachedBlock || null;
        if(!block) {
            const assignment = clubAssignments.find(item =>
                item.sessionId === session.id &&
                item.sessionSnapshot &&
                Array.isArray(item.sessionSnapshot.blocks) &&
                item.sessionSnapshot.blocks[index]
            );
            block = assignment && assignment.sessionSnapshot.blocks[index];
        }
        if(!block && blockId) {
            const blockSnap = await db.collection('blocks').doc(blockId).get();
            if(blockSnap.exists) block = { id: blockSnap.id, ...blockSnap.data() };
        }
        if(!block) throw new Error(`L'exercice ${blockId || index + 1} n'est plus disponible.`);
        return {
            id: block.id || blockId || `block-${index}`,
            category: block.category || '',
            title: block.title || '',
            description: block.description || ''
        };
    }));
}

function duplicateSession(id) {
    const s = clubSessions.find(x => x.id === id);
    const newSession = { id: 'sess_' + Date.now(), name: s.name + " (Copie)", blocks: [...s.blocks], clubId: currentUser.clubId, authorId: currentUser.id, isShared: false };
    db.collection('sessions').doc(newSession.id).set(newSession);
    setSessionLibraryTab('personal'); 
}
async function deleteSession(id) {
    if(!id || id === 'undefined') return alert("Erreur: identifiant de séance introuvable.");
    const session = clubSessions.find(item => item.id === id);
    if(!canManageClubSession(session)) {
        return alert("Seul le coach qui a partagé cette séance ou un gérant du club peut la supprimer.");
    }
    if(!await showAppConfirm("Retirer cette séance de la banque ? Les séances déjà attribuées resteront accessibles aux élèves et dans leur historique.")) return;
    try {
        const clubAssignmentSnapshot = await db.collection('assignments')
            .where('clubId', '==', currentUser.clubId)
            .get();
        const hasAssignments = clubAssignmentSnapshot.docs.some(doc => doc.data().sessionId === id);
        const sessionRef = db.collection('sessions').doc(id);
        if(!hasAssignments) {
            await sessionRef.delete();
        } else {
            await sessionRef.update({ archived: true });
        }
        clubSessions = clubSessions.filter(session => session.id !== id || hasAssignments);
        const archivedSession = clubSessions.find(session => session.id === id);
        if(archivedSession) archivedSession.archived = true;
        renderCoachDashboard();
    } catch(err) {
        console.error("Erreur suppression séance:", err);
        alert("Erreur lors du retrait de la séance : " + err.message);
    }
}
function openEditSession(id) {
    editingSessionId = id; const s = clubSessions.find(x => x.id === id);
    if(!canManageClubSession(s)) {
        editingSessionId = null;
        return alert("Seul le coach qui a partagé cette séance ou un gérant du club peut la modifier.");
    }
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
    renderFilterTags('coach-dashboard-filters', clubCats, coachBlockFilter, setCoachBlockFilter);
    
    const myBlocks = getMyBlocks();
    let fBlocks = coachBlockFilter === 'Toutes' ? myBlocks : myBlocks.filter(b => b.category === coachBlockFilter);
    if (coachBlockSearch) fBlocks = fBlocks.filter(b => (b.title || '').toLowerCase().includes(coachBlockSearch.toLowerCase()));
    document.getElementById('coach-blocks-grid').innerHTML = fBlocks.map(b => `<div class="card"><div class="card-header"><span class="card-category">${escapeHtml(b.category)}</span><div style="display:flex;gap:0.25rem;"><button class="btn-icon" style="padding:0;" onclick="openEditBlock('${escapeHtml(b.id)}')">✏️</button><button class="btn-icon" style="padding:0; color:var(--danger);" onclick="deleteBlock('${escapeHtml(b.id)}')">🗑️</button></div></div><div class="card-title">${escapeHtml(b.title)}</div><p style="font-size:0.95rem; color:var(--text-muted);">${escapeHtml(b.description)}</p></div>`).join('') || "<p style='color:var(--text-muted); grid-column:1/-1; padding:2rem; text-align:center;'>Aucun bloc personnel créé.</p>";
    
    let tSessions = currentSessionLibraryTab === 'personal'
        ? clubSessions.filter(s => !s.archived && s.authorId === currentUser.id && !s.isShared)
        : clubSessions.filter(s => !s.archived && s.isShared);
    if (coachSessionSearch) tSessions = tSessions.filter(s => (s.name || '').toLowerCase().includes(coachSessionSearch.toLowerCase()));
    document.getElementById('coach-sessions-grid').innerHTML = tSessions.map(s => {
        let shareBtn = currentSessionLibraryTab === 'personal' ? `<button class="btn-outline" style="width:100%; margin-bottom:1rem;" onclick="publishToClub('${escapeHtml(s.id)}')">Partager au Club</button>` : '';
        let actions = `<button class="btn-icon" title="Dupliquer" onclick="duplicateSession('${escapeHtml(s.id)}')">📋</button>`;
        if(canManageClubSession(s)) {
            actions += ` <button class="btn-icon" title="Modifier" onclick="openEditSession('${escapeHtml(s.id)}')">✏️</button> <button class="btn-icon" style="color:var(--danger);" title="Supprimer" onclick="deleteSession('${escapeHtml(s.id)}')">🗑️</button>`;
        }

        const pendingAssigns = clubAssignments.filter(a => a.sessionId === s.id && !a.isDone);
        let assignedHtml = '';
        if(pendingAssigns.length > 0) {
            const names = pendingAssigns.map(a => { const u = clubMembers.find(x=>x.id===a.athleteId); return u ? escapeHtml(u.username) : ''; }).filter(Boolean).join(', ');
            assignedHtml = `<div style="font-size:0.8rem; color:var(--ffme-blue-dark); background:#EFF6FF; padding:0.5rem 0.8rem; border-radius:var(--radius-md); margin-bottom:1rem; font-weight:600; border:1px solid #BFDBFE;">En cours par : ${names}</div>`;
        }

        return `<div class="card">
                    <div class="card-header" style="align-items:flex-start;">
                        <div class="card-title" style="flex:1;">${escapeHtml(s.name)}</div>
                        <div style="display:flex; gap:0.25rem;">${actions}</div>
                    </div>
                    <p style="font-size:0.95rem; color:var(--text-muted); font-weight:600; margin-bottom:1.5rem; margin-top:0;">🧗 ${(s.blocks || []).length} exercices</p>
                    ${assignedHtml}
                    ${shareBtn}
                    <button class="btn-primary" style="width:100%; margin-top:auto;" onclick="openAssignModal('${escapeHtml(s.id)}')">👥 Attribuer</button>
                </div>`;
    }).join('');
}

async function publishToClub(id) {
    const session = clubSessions.find(item =>
        item.id === id &&
        item.clubId === currentUser.clubId &&
        item.authorId === currentUser.id &&
        !item.isShared
    );
    if(!session || !hasCoachRights()) {
        return alert("Seul le coach propriétaire peut partager cette séance au club.");
    }

    try {
        const blockSnapshots = await getClubSessionBlockSnapshots(session);
        const sharedSession = {
            id: 'sess_' + Date.now(),
            name: session.name,
            blocks: [...session.blocks],
            blockSnapshots,
            clubId: currentUser.clubId,
            authorId: currentUser.id,
            isShared: true
        };
        await db.collection('sessions').doc(sharedSession.id).set(sharedSession);
        setSessionLibraryTab('club');
    } catch(error) {
        console.error("Erreur de partage de la séance:", error);
        alert("Impossible de partager cette séance : " + error.message);
    }
}

// --- ATTRIBUTION AVEC GROUPES ---
function openAssignModal(sessId) {
    sessionToAssignId = sessId; 
    const pendingExist = clubAssignments.filter(a => a.sessionId === sessId && !a.isDone);
    
    const grpContainer = document.getElementById('assign-groups-container');
    grpContainer.innerHTML = '';
    const groups = (currentUser.profile.groups || []).filter(g => !g.clubId || g.clubId === currentUser.clubId);
    if(groups.length > 0) {
        let html = `<h3 style="border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">Groupes</h3>`;
        groups.forEach(g => {
            html += `
            <div style="background:var(--surface); border:1px solid var(--border-color); border-radius:var(--radius-md); margin-bottom:0.75rem; padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <strong style="font-size:1.1rem; color:var(--ffme-blue);">${escapeHtml(g.name)}</strong>
                    <button class="btn-outline" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="checkGroupAthletes('${escapeHtml(g.id)}')">Tout cocher</button>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;" class="group-checkboxes-${g.id}">
                    ${g.athletes.map(aId => {
                        const ath = clubMembers.find(u=>u.id===aId); if(!ath) return '';
                        return `<label style="font-size:0.85rem;"><input type="checkbox" class="athlete-checkbox" value="${escapeHtml(ath.id)}" ${pendingExist.some(ex => ex.athleteId === ath.id)?'disabled checked':''}> ${escapeHtml(ath.username)}</label>`;
                    }).join('')}
                </div>
            </div>`;
        });
        grpContainer.innerHTML = html;
    }

    document.getElementById('athlete-checklist').innerHTML = clubMembers.map(a => `<label style="display:flex; gap:1rem; padding:0.5rem; background:var(--surface); border:1px solid var(--border-color); border-radius:var(--radius-md); margin-bottom:0.5rem; cursor:pointer;"><input type="checkbox" class="athlete-checkbox" value="${escapeHtml(a.id)}" ${pendingExist.some(ex => ex.athleteId === a.id)?'disabled checked':''}> ${escapeHtml(a.username)} (${escapeHtml(a.role)})</label>`).join('');
    openModal('modal-assign-session');
}

function checkGroupAthletes(gId) { document.querySelectorAll(`.group-checkboxes-${gId} input:not(:disabled)`).forEach(cb => cb.checked = true); }
function selectAllAthletes() { document.querySelectorAll('#athlete-checklist input:not(:disabled)').forEach(cb => cb.checked = true); }

async function saveAssignments() { 
    let selectedIds = new Set();
    document.querySelectorAll('.athlete-checkbox:checked:not(:disabled)').forEach(cb => selectedIds.add(cb.value));
    if(selectedIds.size === 0) return alert("Sélectionnez au moins un membre.");
    const session = clubSessions.find(item => item.id === sessionToAssignId);
    if(!session) return alert("Cette séance n'est plus disponible dans la banque.");

    try {
        const sessionSnapshot = await createAssignedSessionSnapshot(session);
        const batch = db.batch();
        selectedIds.forEach(id => {
            const assRef = db.collection('assignments').doc();
            batch.set(assRef, {
                clubId: currentUser.clubId,
                sessionId: sessionToAssignId,
                sessionSnapshot,
                athleteId: id,
                assignerId: currentUser.id,
                isDone: false,
                annotation: '',
                blockRpes: {},
                avgRpe: null,
                plaisir: null,
                difficulte: null,
                fatigue: null,
                doneAt: null,
                assignedAt: Date.now()
            });
        });
        await batch.commit();
        closeModal('modal-assign-session');
    } catch(error) {
        console.error("Erreur d'attribution de la séance:", error);
        alert("Impossible d'attribuer la séance : " + error.message);
    }
}

// --- GESTION DES GROUPES (COACH) ---
function openManageGroupsModal() {
    resetGroupEditor();
    renderManageGroupsList();
    openModal('modal-manage-groups');
}

function renderGroupMemberPicker() {
    const container = document.getElementById('new-group-athletes');
    const search = document.getElementById('group-member-search');
    const count = document.getElementById('group-member-count');
    if(!container || !search || !count) return;

    const query = search.value.trim().toLocaleLowerCase('fr-FR');
    const visibleMembers = clubMembers.filter(member =>
        String(member.username || '').toLocaleLowerCase('fr-FR').includes(query)
    );
    count.textContent = `${groupEditorSelectedIds.size} sélectionné${groupEditorSelectedIds.size > 1 ? 's' : ''}`;
    container.innerHTML = visibleMembers.map(member => {
        const avatar = member.profile && member.profile.avatar
            ? `<img src="${escapeHtml(member.profile.avatar)}" alt="" class="group-member-avatar">`
            : `<span class="group-member-avatar group-member-avatar-placeholder" aria-hidden="true">👤</span>`;
        return `<label class="group-member-option ${groupEditorSelectedIds.has(member.id) ? 'selected' : ''}">
            <input type="checkbox" class="new-grp-cb" value="${escapeHtml(member.id)}" ${groupEditorSelectedIds.has(member.id) ? 'checked' : ''} onchange="updateGroupMemberSelection(this)">
            ${avatar}
            <span class="group-member-details"><strong>${escapeHtml(member.username || 'Membre')}</strong><small>${escapeHtml(getRoleLabel(getClubRole(member, currentUser.clubId)))}</small></span>
            <span class="group-member-checkmark" aria-hidden="true">✓</span>
        </label>`;
    }).join('') || '<p class="group-member-empty">Aucun membre ne correspond à cette recherche.</p>';
}

function updateGroupMemberSelection(checkbox) {
    if(checkbox.checked) groupEditorSelectedIds.add(checkbox.value);
    else groupEditorSelectedIds.delete(checkbox.value);
    checkbox.closest('.group-member-option').classList.toggle('selected', checkbox.checked);
    renderGroupMemberPickerCount();
}

function renderGroupMemberPickerCount() {
    const count = document.getElementById('group-member-count');
    if(!count) return;
    const selectedCount = groupEditorSelectedIds.size;
    count.textContent = `${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}`;
}

function resetGroupEditor() {
    editingGroupId = null;
    groupEditorSelectedIds = new Set();
    groupEditorAvatar = null;
    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-notify').checked = false;
    document.getElementById('group-avatar-input').value = '';
    document.getElementById('group-member-search').value = '';
    document.getElementById('group-editing-banner').style.display = 'none';
    document.getElementById('btn-cancel-group-edit').style.display = 'none';
    document.getElementById('group-editor-panel').classList.remove('editing');
    document.getElementById('group-editor-title').textContent = 'Créer un groupe';
    document.getElementById('btn-save-group').textContent = 'Créer le groupe';
    renderGroupAvatarPreview();
    renderGroupMemberPicker();
}

function renderGroupAvatarPreview() {
    const preview = document.getElementById('group-avatar-preview');
    const removeButton = document.getElementById('group-avatar-remove');
    if(!preview || !removeButton) return;
    preview.innerHTML = groupEditorAvatar
        ? `<img src="${escapeHtml(groupEditorAvatar)}" alt="Photo du groupe">`
        : '<span aria-hidden="true">👥</span>';
    removeButton.style.display = groupEditorAvatar ? 'inline-block' : 'none';
}

function handleGroupAvatarUpload(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if(!file) return;
    if(!file.type.startsWith('image/')) return alert("Sélectionnez un fichier image.");
    if(file.size > 5 * 1024 * 1024) return alert("La photo ne peut pas dépasser 5 Mo.");

    const reader = new FileReader();
    reader.onerror = () => alert("Impossible de lire la photo sélectionnée.");
    reader.onload = () => {
        const image = new Image();
        image.onerror = () => alert("Le fichier sélectionné n'est pas une image valide.");
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 250;
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext('2d');
            if(!context) return alert("Impossible de traiter cette image.");
            context.fillStyle = '#FFFFFF';
            context.fillRect(0, 0, size, size);
            const minDimension = Math.min(image.width, image.height);
            context.drawImage(
                image,
                (image.width - minDimension) / 2,
                (image.height - minDimension) / 2,
                minDimension,
                minDimension,
                0,
                0,
                size,
                size
            );
            groupEditorAvatar = canvas.toDataURL('image/jpeg', 0.8);
            renderGroupAvatarPreview();
        };
        image.src = reader.result;
    };
    reader.readAsDataURL(file);
}

function removeGroupAvatar() {
    groupEditorAvatar = null;
    renderGroupAvatarPreview();
}

function editGroup(id) {
    const g = (currentUser.profile.groups || []).find(x => x.id === id && (!x.clubId || x.clubId === currentUser.clubId));
    if(!g) return;
    editingGroupId = id;
    groupEditorSelectedIds = new Set(g.athletes || []);
    groupEditorAvatar = g.avatar || null;
    document.getElementById('new-group-name').value = g.name;
    document.getElementById('new-group-notify').checked = g.notify || false;
    document.getElementById('group-member-search').value = '';
    document.getElementById('group-editing-name').textContent = g.name;
    document.getElementById('group-editing-banner').style.display = 'flex';
    document.getElementById('btn-cancel-group-edit').style.display = 'inline-flex';
    document.getElementById('group-editor-panel').classList.add('editing');
    document.getElementById('group-editor-title').textContent = 'Modifier le groupe';
    document.getElementById('btn-save-group').textContent = 'Enregistrer les modifications';
    renderGroupAvatarPreview();
    renderGroupMemberPicker();
    renderManageGroupsList();
    document.getElementById('group-editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelGroupEdit() {
    resetGroupEditor();
    renderManageGroupsList();
}

async function deleteGroup(gId) {
    if(!await showAppConfirm("Supprimer ce groupe ?")) return;
    currentUser.profile.groups = currentUser.profile.groups.filter(g => g.id !== gId);
    await db.collection('users').doc(currentUser.id).update({ 'profile.groups': currentUser.profile.groups });
    if(editingGroupId === gId) resetGroupEditor();
    renderManageGroupsList();
    renderCoachAthletes();
}

async function saveNewGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    const notify = document.getElementById('new-group-notify').checked;
    if(!name) return alert("Saisissez un nom pour le groupe.");
    const ids = [...groupEditorSelectedIds];
    const groups = [...(currentUser.profile.groups || [])];
    const groupIndex = groups.findIndex(group => group.id === editingGroupId);

    if(editingGroupId && groupIndex === -1) {
        resetGroupEditor();
        renderManageGroupsList();
        return alert("Ce groupe n'existe plus. Vous pouvez en créer un nouveau.");
    }

    if(groupIndex !== -1) {
        groups[groupIndex] = { ...groups[groupIndex], name, athletes: ids, notify, avatar: groupEditorAvatar, clubId: currentUser.clubId };
    } else {
        groups.push({ id: 'grp_' + Date.now(), name, athletes: ids, notify, avatar: groupEditorAvatar, clubId: currentUser.clubId });
    }

    const saveButton = document.getElementById('btn-save-group');
    saveButton.disabled = true;
    try {
        await db.collection('users').doc(currentUser.id).update({ 'profile.groups': groups });
        currentUser.profile.groups = groups;
        resetGroupEditor();
        renderManageGroupsList();
        renderCoachAthletes();
    } catch(error) {
        console.error("Erreur d'enregistrement du groupe:", error);
        alert("Impossible d'enregistrer le groupe : " + error.message);
    } finally {
        saveButton.disabled = false;
    }
}

function renderManageGroupsList() {
    const groups = (currentUser.profile.groups || []).filter(g => !g.clubId || g.clubId === currentUser.clubId);
    document.getElementById('existing-groups-list').innerHTML = groups.map(g => `
        <div class="existing-group-item ${g.id === editingGroupId ? 'active' : ''}">
            <div class="existing-group-info"><strong>${escapeHtml(g.name)}</strong><span>${(g.athletes || []).length} membres${g.notify ? ' · 🔔 Alertes' : ''}</span></div>
            <div class="existing-group-actions">
                <button class="btn-icon" title="Modifier ${escapeHtml(g.name)}" aria-label="Modifier ${escapeHtml(g.name)}" onclick="editGroup('${escapeHtml(g.id)}')">✏️</button>
                <button class="btn-icon" title="Supprimer ${escapeHtml(g.name)}" aria-label="Supprimer ${escapeHtml(g.name)}" onclick="deleteGroup('${escapeHtml(g.id)}')">🗑️</button>
            </div>
        </div>
    `).join('') || "<p class='group-member-empty'>Aucun groupe créé pour ce club.</p>";
}

async function toggleGroupAlerts(groupId) {
    if(!groupId || groupAlertsUpdating.has(groupId)) return;
    const groups = [...(currentUser.profile.groups || [])];
    const groupIndex = groups.findIndex(group => group.id === groupId && (!group.clubId || group.clubId === currentUser.clubId));
    if(groupIndex === -1) return alert("Ce groupe n'existe plus.");

    const groupViewIsOpen = document.getElementById('coach-athletes-view').style.display !== 'none';
    groupAlertsUpdating.add(groupId);
    const notifyCheckbox = document.getElementById('group-view-notify-checkbox');
    if(notifyCheckbox) notifyCheckbox.disabled = true;
    const updatedGroup = { ...groups[groupIndex], notify: !groups[groupIndex].notify };
    groups[groupIndex] = updatedGroup;
    try {
        await db.collection('users').doc(currentUser.id).update({ 'profile.groups': groups });
        currentUser.profile.groups = groups;
        renderCoachAthletes();
        if(document.getElementById('modal-manage-groups').style.display === 'flex') renderManageGroupsList();
        if(groupViewIsOpen) showAthletesGrid(groupId);
    } catch(error) {
        console.error("Erreur de mise à jour des alertes du groupe:", error);
        alert("Impossible de modifier les alertes du groupe : " + error.message);
        if(groupViewIsOpen) showAthletesGrid(groupId);
    } finally {
        groupAlertsUpdating.delete(groupId);
        if(notifyCheckbox) notifyCheckbox.disabled = false;
    }
}

function handleGroupNotificationToggle(checkbox) {
    checkbox.closest('.group-view-notify').classList.toggle('active', checkbox.checked);
    toggleGroupAlerts(viewedGroupId);
}

// --- COACH ATHLETES VIEW ---
function renderCoachAthletes() {
    document.getElementById('coach-groups-view').style.display = 'grid';
    document.getElementById('coach-athletes-view').style.display = 'none';

    let html = `<div class="card interactive" style="align-items:center; text-align:center; background: var(--gradient-primary); color: white; border:none;" onclick="showAthletesGrid('all')">
                    <div style="width:76px;height:76px;border-radius:50%;overflow:hidden;margin-bottom:0.5rem;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:1.7rem;font-weight:800;">${getMyClubObj().avatar ? `<img src="${escapeHtml(getMyClubObj().avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : escapeHtml((getMyClubObj().name || 'C').charAt(0).toUpperCase())}</div>
                    <div class="card-title" style="color:white; font-size:1.3rem;">${escapeHtml(getMyClubObj().name || 'Mon club')}</div>
                    <div style="font-size:0.9rem; opacity:0.9;">${clubMembers.length} membres</div>
                    ${hasCoachRights() && currentUser.clubId ? '<button class="btn-outline" style="margin-top:0.75rem;background:white;" onclick="event.stopPropagation(); document.getElementById(\'club-avatar-input\').click()">Ajouter / modifier la photo</button>' : ''}
                </div>`;
                
    const currentClubGroups = (currentUser.profile.groups || []).filter(g => !g.clubId || g.clubId === currentUser.clubId);
    if(currentClubGroups.length > 0) {
        currentClubGroups.forEach(g => {
            html += `<div class="card interactive coach-group-card" onclick="showAthletesGrid('${escapeHtml(g.id)}')">
                        <div class="coach-group-icon" aria-hidden="true">👥</div>
                        <div class="card-title" style="font-size:1.3rem;">${escapeHtml(g.name)}</div>
                        <div style="font-size:0.9rem; color:var(--text-muted); font-weight:600;">${(g.athletes || []).length} membres</div>
                     </div>`;
        });
    }
    document.getElementById('coach-groups-view').innerHTML = html;
}

function showAthletesGrid(groupId) {
    document.getElementById('coach-groups-view').style.display = 'none';
    document.getElementById('coach-athletes-view').style.display = 'block';
    viewedGroupId = groupId === 'all' ? null : groupId;
    
    let targetAthletes = [];
    let title = "";
    let group = null;

    if(groupId === 'all') {
        targetAthletes = clubMembers;
        title = getMyClubObj().name || "Tous les membres";
    } else {
        group = (currentUser.profile.groups || []).find(x => x.id === groupId && (!x.clubId || x.clubId === currentUser.clubId));
        if(group) {
            title = "Groupe : " + group.name;
            targetAthletes = (group.athletes || []).map(id => clubMembers.find(u => u.id === id)).filter(Boolean);
        }
    }
    
    document.getElementById('current-group-title').textContent = title;
    const notifyControl = document.getElementById('group-view-notify-control');
    const notifyCheckbox = document.getElementById('group-view-notify-checkbox');
    if(notifyControl && notifyCheckbox) {
        notifyControl.style.display = group ? 'inline-flex' : 'none';
        notifyControl.classList.toggle('active', Boolean(group && group.notify));
        notifyCheckbox.checked = Boolean(group && group.notify);
        notifyCheckbox.disabled = Boolean(group && groupAlertsUpdating.has(group.id));
    }

    document.getElementById('coach-athletes-grid').innerHTML = targetAthletes.map(ath => {
        const pending = clubAssignments.filter(a => a.athleteId === ath.id && !a.isDone).length;
        let badge = pending > 0 ? `<span class="status-badge status-done">${pending} attente</span>` : `<span class="status-badge status-alert">0 séance</span>`;
        let avatarHtml = `<div style="font-size:2rem; margin-bottom:0.5rem; width:60px; height:60px; display:flex; align-items:center; justify-content:center; background:var(--bg-color); border-radius:50%;">👤</div>`;
        if(ath.profile && ath.profile.avatar) avatarHtml = `<img src="${escapeHtml(ath.profile.avatar)}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; margin-bottom:0.5rem;">`;
        return `<div class="card interactive" style="align-items:center; text-align:center;" onclick="openAthleteProfileCoach('${escapeHtml(ath.id)}')">${avatarHtml}<div class="card-title">${escapeHtml(ath.username)} <span style="font-size:0.8rem; opacity:0.7;">(${escapeHtml(getRoleLabel(getClubRole(ath, currentUser.clubId)))})</span></div><div>${badge}</div></div>`;
    }).join('') || "<p style='color:var(--text-muted); grid-column:1/-1; text-align:center;'>Aucun membre dans cette liste.</p>";
}

function backToGroupsView() { renderCoachAthletes(); }

let viewedAthleteId = null;
function openAthleteProfileCoach(athId) {
    viewedAthleteId = athId;
    const ath = clubMembers.find(u => u.id === athId);
    if(!ath) return;
    document.getElementById('view-athlete-name').textContent = "Profil de " + ath.username;
    const roleControl = document.getElementById('view-athlete-role-control');
    const roleSelect = document.getElementById('view-athlete-role');
    if(roleControl && roleSelect) {
        roleControl.style.display = isClubManager() ? 'block' : 'none';
        roleSelect.value = getClubRole(ath, currentUser.clubId);
    }
    document.getElementById('view-athlete-objectives').textContent = ath.profile.objectives || "Aucun objectif.";
    document.getElementById('view-athlete-comps').innerHTML = ath.profile.competitions.map(c => `<div class="comp-item"><b>${escapeHtml(c.type)}</b> - ${escapeHtml(c.place)}<br><span style="font-size:0.9rem; color:var(--text-muted);">${escapeHtml(c.feeling)}</span></div>`).join('') || "<p style='color:var(--text-muted);'>Aucune compétition.</p>";

    renderRadarChart('chart-t1-coach', ath.profile.skillsT1, "Technique & Gestuelle", 'rgba(0, 85, 164, 0.5)');
    renderRadarChart('chart-t2-coach', ath.profile.skillsT2, 'Physique & Mental', 'rgba(239, 68, 68, 0.5)');
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
        renderCoachAthleteHistory();
    }
}

function canCoachViewAssignedSession(assignment, session) {
    if(!assignment) return false;
    if(isClubManager(currentUser, currentUser.clubId)) return true;
    if(!session) return false;
    if(assignment.clubId !== currentUser.clubId || session.clubId !== currentUser.clubId) return false;
    return session.authorId === currentUser.id ||
        session.isShared === true;
}

async function renderCoachAthleteHistory() {
    const assignments = clubAssignments.filter(assignment => assignment.athleteId === viewedAthleteId);
    let historySessions = clubSessions;
    if(isClubManager(currentUser, currentUser.clubId)) {
        const loadedSessionIds = new Set(clubSessions.map(session => session.id));
        const missingSessionIds = [...new Set(assignments
            .filter(assignment => !assignment.sessionSnapshot)
            .map(assignment => assignment.sessionId))]
            .filter(sessionId => !loadedSessionIds.has(sessionId));
        try {
            const extraSessions = await Promise.all(missingSessionIds.map(async sessionId => {
                const sessionSnap = await db.collection('sessions').doc(sessionId).get();
                return sessionSnap.exists ? { id: sessionSnap.id, ...sessionSnap.data() } : null;
            }));
            historySessions = [...clubSessions, ...extraSessions.filter(Boolean)];
        } catch(error) {
            console.error("Erreur de chargement des séances attribuées:", error);
            alert("Impossible de charger certaines séances de l'historique : " + error.message);
        }
    }

    const current = assignments
        .filter(assignment => !assignment.isDone)
        .sort((a, b) => (b.assignedAt || b.createdAt || 0) - (a.assignedAt || a.createdAt || 0));
    const done = assignments
        .filter(assignment => assignment.isDone)
        .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

    const renderCard = (assignment, isDone) => {
        const session = assignment.sessionSnapshot || historySessions.find(item => item.id === assignment.sessionId);
        const canView = canCoachViewAssignedSession(assignment, session);
        const rpeWarning = isDone && assignment.avgRpe >= 8 ? 'alert-rpe' : '';
        const cardClass = canView ? 'card interactive' : 'card coach-session-locked';
        const openHandler = canView ? `onclick="viewSessionReadonly('${escapeHtml(assignment.id)}')"` : 'aria-disabled="true"';
        const sessionTitle = session ? session.name : 'Séance indisponible';
        const deleteButton = hasCoachRights() && assignment.clubId === currentUser.clubId
            ? `<button class="btn-icon coach-history-delete" type="button" title="Supprimer cette attribution" aria-label="Supprimer l’attribution de ${escapeHtml(sessionTitle)}" onclick="event.stopPropagation(); deleteAssignment('${escapeHtml(assignment.id)}', true)">🗑️</button>`
            : '';
        return `<div class="${cardClass} ${rpeWarning}" ${openHandler}>
                    <div class="card-header">
                        <span class="card-category">${isDone ? `RPE Moyen : ${assignment.avgRpe ? assignment.avgRpe.toFixed(1) : '-'}` : 'En cours'}</span>
                        <div class="coach-session-card-status">
                            ${isDone ? '<span class="status-badge status-done">Terminée</span>' : '<span class="status-badge status-alert">À réaliser</span>'}
                            ${canView ? '' : '<span class="session-access-lock" title="Détail non accessible" aria-label="Détail non accessible">🔒</span>'}
                            ${deleteButton}
                        </div>
                    </div>
                    <div class="card-title">${escapeHtml(sessionTitle)}</div>
                    ${canView ? '' : '<div class="session-access-note">Le détail de cette séance n’est pas accessible.</div>'}
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">${isDone && assignment.doneAt ? new Date(assignment.doneAt).toLocaleDateString('fr-FR') : ''}</div>
                </div>`;
    };

    document.getElementById('coach-ath-current-sessions').innerHTML = current.map(assignment => renderCard(assignment, false)).join('') ||
        "<p class='coach-history-empty'>Aucune séance en cours.</p>";
    document.getElementById('coach-ath-history-list').innerHTML = done.map(assignment => renderCard(assignment, true)).join('') ||
        "<p class='coach-history-empty'>Aucune séance réalisée.</p>";
}

async function viewSessionReadonly(assId) {
    const a = clubAssignments.find(x => x.id === assId);
    if(!a) {
        alert("Cette séance n'est plus disponible.");
        return;
    }
    const isManager = isClubManager(currentUser, currentUser.clubId);
    let s = a.sessionSnapshot || clubSessions.find(x => x.id === a.sessionId);
    if(!s && isManager) {
        try {
            const sessionSnap = await db.collection('sessions').doc(a.sessionId).get();
            if(sessionSnap.exists) s = { id: sessionSnap.id, ...sessionSnap.data() };
        } catch(error) {
            console.error("Erreur de chargement de la séance:", error);
            alert("Impossible de charger le détail de la séance : " + error.message);
            return;
        }
    }
    if(!canCoachViewAssignedSession(a, s)) {
        alert("Accès refusé : cette séance n'est ni personnelle, ni partagée dans le club.");
        return;
    }
    if(!s) {
        alert("Le détail de cette séance n'est plus disponible.");
        return;
    }

    document.getElementById('view-session-title').textContent = s.name + " (Lecture Seule)";
    document.getElementById('view-session-athlete-form').style.display = 'none';
    document.getElementById('view-session-coach-readonly').style.display = 'block';
    document.getElementById('view-session-coach-report').style.display = 'block';

    let sessionBlocks = getAssignmentBlocks(a, s);
    if(isManager && (!a.sessionSnapshot || sessionBlocks.length < (s.blocks || []).length)) {
        try {
            const blockIds = (s.blocks || []).map(block => typeof block === 'string' ? block : block.id);
            sessionBlocks = await Promise.all(blockIds.map(async (blockId, index) => {
                const snapshotBlock = a.sessionSnapshot && a.sessionSnapshot.blocks[index];
                if(snapshotBlock) return snapshotBlock;
                const cachedBlock = clubBlocks.find(block => block.id === blockId);
                if(cachedBlock) return cachedBlock;
                if(!blockId) return null;
                const blockSnap = await db.collection('blocks').doc(blockId).get();
                return blockSnap.exists ? { id: blockSnap.id, ...blockSnap.data() } : null;
            }));
        } catch(error) {
            console.error("Erreur de chargement des blocs de la séance:", error);
            alert("Impossible de charger les exercices de la séance : " + error.message);
            return;
        }
    }

    document.getElementById('view-session-content-coach').innerHTML = sessionBlocks.map((b, i) => {
        let rpeHtml = '';
        if(b && b.category !== 'Débrief') {
            const blockRpeVal = (a.blockRpes && a.blockRpes[b.id]) ? a.blockRpes[b.id] : '-';
            rpeHtml = `<div style="margin-top:0.75rem; font-size:0.9rem; color:var(--ffme-red); font-weight:700;">RPE Donné : ${blockRpeVal}</div>`;
        }
        return b ? `<div style="padding:1rem; border:1px solid var(--border-color); border-left:4px solid var(--ffme-blue); border-radius:var(--radius-md); margin-bottom:1rem; background:var(--surface);">
                    <div class="card-category" style="margin-bottom:0.5rem;">${escapeHtml(b.category)}</div>
                    <div style="font-weight:800; font-size:1.1rem; margin-bottom:0.5rem;">${i+1}. ${escapeHtml(b.title)}</div>
                    <div style="white-space:pre-wrap; font-size:0.95rem; color:var(--text-muted);">${escapeHtml(b.description)}</div>
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

function getRPEInfo(val) {
    const v = parseInt(val);
    if (v <= 3) return { text: `${v}/10 - Très Facile`, color: '#10B981' };
    if (v <= 5) return { text: `${v}/10 - Modéré`, color: '#3B82F6' };
    if (v <= 7) return { text: `${v}/10 - Difficile`, color: '#F59E0B' };
    if (v <= 9) return { text: `${v}/10 - Très Dur (Rési)`, color: '#EF4135' };
    return { text: '10/10 - Effort Maximal !', color: '#991B1B' };
}

function updateRPEBadgeUI(inputEl) {
    const info = getRPEInfo(inputEl.value);
    const badge = inputEl.previousElementSibling.querySelector('.rpe-badge');
    if (badge) {
        badge.textContent = info.text;
        badge.style.backgroundColor = info.color;
    }
}

function renderAthleteSessions() {
    const myAss = clubAssignments.filter(a => a.athleteId === currentUser.id);
    const todo = myAss.filter(a => !a.isDone); 
    const done = myAss.filter(a => a.isDone).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
    
    const renderCard = (a) => {
        const s = getAssignmentSession(a); if(!s) return '';
        const blockCount = getAssignmentBlocks(a, s).length;
        let assignerStr = '';
        if(a.assignerId) {
            const c = clubMembers.find(u=>u.id===a.assignerId);
            if(c) assignerStr = `<span style="font-size:0.75rem; background:#F1F5F9; color:var(--text-muted); padding:2px 6px; border-radius:4px; margin-left:8px;">Attribué par ${escapeHtml(c.username)}</span>`;
        }
        const deleteTitle = a.isDone ? "Supprimer de l'historique" : "Supprimer de mes séances";
        return `<div class="card interactive" onclick="openSessionAthlete('${escapeHtml(a.id)}')"><div class="card-header" style="align-items:center;"><span class="card-category">Entraînement</span><div style="display:flex; align-items:center; gap:0.5rem; margin-left:auto;">${a.isDone ? '<span class="status-badge status-done">Fait ✓</span>' : ''}<button class="btn-icon" style="color:var(--danger); padding:2px;" title="${deleteTitle}" onclick="event.stopPropagation(); deleteAssignment('${escapeHtml(a.id)}')">🗑️</button></div></div><div class="card-title" style="font-size:1.25rem;">${escapeHtml(s.name)}</div><p style="font-size:0.95rem; color:var(--text-muted); margin:0;">🧗 ${blockCount} exercices ${assignerStr}</p></div>`;
    };
    
    document.getElementById('classic-sessions-grid').innerHTML = todo.map(renderCard).join('') || "<p style='color:var(--text-muted); grid-column:1/-1; text-align:center; padding:3rem;'>Aucune séance en attente.</p>";
    document.getElementById('done-sessions-grid').innerHTML = done.map(renderCard).join('') || "<p style='color:var(--text-muted);'>Aucune séance réalisée.</p>";
}

function updateAthleteClubMemberSearch(value) {
    athleteClubMemberSearch = value.trim().toLocaleLowerCase('fr');
    renderAthleteClubMembers();
}

function renderAthleteClubMembers() {
    const title = document.getElementById('athlete-club-members-title');
    const grid = document.getElementById('athlete-club-members-grid');
    if(!title || !grid) return;
    title.textContent = getMyClubObj().name || 'mon club';

    const members = clubMembers
        .filter(member => (member.username || '').toLocaleLowerCase('fr').includes(athleteClubMemberSearch))
        .sort((a, b) => (a.username || '').localeCompare(b.username || '', 'fr'));
    grid.innerHTML = members.map(member => {
        const avatar = member.profile && member.profile.avatar
            ? `<img src="${escapeHtml(member.profile.avatar)}" alt="" class="athlete-club-member-avatar">`
            : `<div class="athlete-club-member-avatar athlete-club-member-placeholder" aria-hidden="true">👤</div>`;
        return `<article class="card athlete-club-member-card">
                    ${avatar}
                    <div class="card-title">${escapeHtml(member.username || 'Membre')}</div>
                    <span class="card-category">${escapeHtml(getRoleLabel(getClubRole(member, currentUser.clubId)))}</span>
                </article>`;
    }).join('') || `<p class="athlete-club-empty">${athleteClubMemberSearch ? 'Aucun membre ne correspond à cette recherche.' : 'Aucun membre trouvé dans ce club.'}</p>`;
}

function updateAthleteClubSessionSearch(value) {
    athleteClubSessionSearch = value.trim().toLocaleLowerCase('fr');
    renderAthleteClubSessions();
}

function renderAthleteClubSessions() {
    const grid = document.getElementById('athlete-club-sessions-grid');
    if(!grid) return;
    const sessions = clubSessions
        .filter(session => session.clubId === currentUser.clubId && session.isShared === true && !session.archived)
        .filter(session => (session.name || '').toLocaleLowerCase('fr').includes(athleteClubSessionSearch))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
    grid.innerHTML = sessions.map(session => {
        const blockCount = Array.isArray(session.blocks) ? session.blocks.length : 0;
        return `<article class="card">
                    <div class="card-header"><span class="card-category">Séance partagée</span></div>
                    <div class="card-title">${escapeHtml(session.name || 'Séance sans titre')}</div>
                    <p class="athlete-club-session-meta">🧗 ${blockCount} exercice${blockCount > 1 ? 's' : ''}</p>
                    <button class="btn-outline" type="button" onclick="openAthleteClubSession('${escapeHtml(session.id)}')">Voir le détail</button>
                </article>`;
    }).join('') || `<p class="athlete-club-empty">${athleteClubSessionSearch ? 'Aucune séance ne correspond à cette recherche.' : 'Aucune séance n’a été partagée dans votre club pour le moment.'}</p>`;
}

async function openAthleteClubSession(sessionId) {
    const session = clubSessions.find(item =>
        item.id === sessionId &&
        item.clubId === currentUser.clubId &&
        item.isShared === true &&
        !item.archived
    );
    if(!session) {
        alert("Cette séance n'est plus disponible dans la bibliothèque du club.");
        return;
    }

    let sessionBlocks;
    try {
        sessionBlocks = await getClubSessionBlockSnapshots(session);
    } catch(error) {
        console.error("Erreur de chargement des exercices de la séance:", error);
        alert("Impossible de charger le détail de cette séance : " + error.message);
        return;
    }

    document.getElementById('view-session-title').textContent = `${session.name || 'Séance'} (Bibliothèque du club)`;
    document.getElementById('view-session-athlete-form').style.display = 'none';
    document.getElementById('view-session-coach-readonly').style.display = 'block';
    document.getElementById('view-session-coach-report').style.display = 'none';
    document.getElementById('view-session-content-coach').innerHTML = sessionBlocks.map((block, index) => block
        ? `<div class="club-session-detail-block">
                <div class="card-category">${escapeHtml(block.category || 'Exercice')}</div>
                <div class="club-session-detail-title">${index + 1}. ${escapeHtml(block.title || 'Exercice sans titre')}</div>
                <div class="club-session-detail-description">${escapeHtml(block.description || '')}</div>
            </div>`
        : `<div class="club-session-detail-block"><div class="club-session-detail-description">Cet exercice n’est plus disponible.</div></div>`
    ).join('') || '<p class="athlete-club-empty">Cette séance ne contient aucun exercice.</p>';
    openModal('modal-view-session');
}

async function deleteAssignment(assId, fromCoachHistory = false) {
    if(!assId) return;
    const assignment = clubAssignments.find(x => x.id === assId);
    if(!assignment) return alert("Cette attribution n'est plus disponible.");
    if(fromCoachHistory &&
        (!hasCoachRights() || assignment.clubId !== currentUser.clubId ||
         assignment.athleteId !== viewedAthleteId)) {
        return alert("Vous n'avez pas l'autorisation de supprimer cette attribution.");
    }
    const assignedSession = getAssignmentSession(assignment);
    const confirmation = fromCoachHistory
        ? `Supprimer l'attribution « ${assignedSession ? assignedSession.name : 'Séance'} » de cet élève ?${assignment.isDone ? " Son historique de réalisation sera également supprimé." : ''}`
        : assignment.isDone
            ? "Supprimer définitivement cette séance de votre historique ?"
            : "Supprimer cette séance de votre liste ?";
    if(!await showAppConfirm(confirmation)) return;
    try {
        await db.collection('assignments').doc(assId).delete();
        clubAssignments = clubAssignments.filter(x => x.id !== assId);
        renderAthleteSessions();
        if(fromCoachHistory) renderCoachAthleteHistory();
    } catch(err) {
        console.error("Erreur suppression attribution:", err);
        alert("Impossible de supprimer la séance : " + err.message);
    }
}

function openSessionAthlete(assId) {
    viewedAssignmentId = assId; 
    const a = clubAssignments.find(x => x.id === assId); 
    if(!a) return;
    const s = getAssignmentSession(a);
    if(!s) return;
    const sessionBlocks = getAssignmentBlocks(a, s);
    
    document.getElementById('view-session-title').textContent = s.name;
    document.getElementById('view-session-athlete-form').style.display = 'block';
    document.getElementById('view-session-coach-readonly').style.display = 'none';

    document.getElementById('session-annotation').value = a.annotation || '';
    document.getElementById('session-plaisir').value = a.plaisir || 5; 
    document.getElementById('val-plaisir').textContent = a.plaisir || 5;
    document.getElementById('session-difficulte').value = a.difficulte || 5; 
    document.getElementById('val-diff').textContent = a.difficulte || 5;
    document.getElementById('session-fatigue').value = a.fatigue || 5; 
    document.getElementById('val-fatigue').textContent = a.fatigue || 5;
    
    resetTimer(); 
    document.getElementById('chrono-container').style.display = 'none';

    document.getElementById('view-session-content-athlete').innerHTML = sessionBlocks.map((b, i) => {
        if (!b) return '';

        let rpeHtml = '';
        if (b.category !== 'Débrief') {
            const blockRpeVal = (a.blockRpes && a.blockRpes[b.id]) ? a.blockRpes[b.id] : 5;
            const rpeInfo = getRPEInfo(blockRpeVal);

            rpeHtml = `
            <div class="rpe-container">
                <div class="rpe-header">
                    <span class="rpe-title">Ressenti d'effort (RPE) :</span>
                    <span class="rpe-badge" style="background-color: ${rpeInfo.color};">${rpeInfo.text}</span>
                </div>
                <input type="range" class="block-rpe-slider rpe-slider-custom" data-blockid="${escapeHtml(b.id)}" min="1" max="10" value="${blockRpeVal}" oninput="updateRPEBadgeUI(this)">
                <div class="rpe-scale-labels">
                    <span>1 - Repos</span>
                    <span>5 - Moyen</span>
                    <span>10 - Max</span>
                </div>
            </div>`;
        }

        return `
        <div class="athlete-block-card">
            <div class="card-category" style="margin-bottom:0.5rem;">${escapeHtml(b.category)}</div>
            <div style="font-weight:800; font-size:1.15rem; margin-bottom:0.5rem; color:var(--ffme-blue-dark);">${i+1}. ${escapeHtml(b.title)}</div>
            <div style="white-space:pre-wrap; font-size:0.95rem; color:var(--text-dark); line-height:1.5;">${escapeHtml(b.description)}</div>
            ${rpeHtml}
        </div>`;
    }).join('');
    
    const btn = document.getElementById('btn-validate-session');
    if (btn) {
        btn.textContent = a.isDone ? "Mettre à jour mon retour" : "✓ Marquer la séance comme terminée";
    }
    openModal('modal-view-session');
}

// Fonction de validation (Maintenant sécurisée et liée au bouton)
document.getElementById('btn-validate-session').onclick = async function() {
    if (!viewedAssignmentId) return;
    const a = clubAssignments.find(x => x.id === viewedAssignmentId);
    if (!a) return;

    const annotation = document.getElementById('session-annotation').value.trim();
    const plaisir = parseInt(document.getElementById('session-plaisir').value) || 5;
    const difficulte = parseInt(document.getElementById('session-difficulte').value) || 5;
    const fatigue = parseInt(document.getElementById('session-fatigue').value) || 5;

    let blockRpes = {};
    let rpeSum = 0;
    let rpeCount = 0;

    document.querySelectorAll('.block-rpe-slider').forEach(input => {
        const bId = input.dataset.blockid;
        const val = parseInt(input.value) || 5;
        blockRpes[bId] = val;
        rpeSum += val;
        rpeCount++;
    });

    const avgRpe = rpeCount > 0 ? (rpeSum / rpeCount) : difficulte;

    await db.collection('assignments').doc(a.id).update({
        isDone: true,
        doneAt: Date.now(),
        annotation: annotation,
        plaisir: plaisir,
        difficulte: difficulte,
        fatigue: fatigue,
        blockRpes: blockRpes,
        avgRpe: avgRpe
    });

    closeModal('modal-view-session');
    refreshCurrentTab();
    alert("Séance enregistrée avec succès !");
};

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
    if(currentUser.parentCode) { pCode.innerHTML = `<div class="parent-code-badge">Code Enfant : ${escapeHtml(currentUser.parentCode)}</div>`; pCode.style.display = 'block'; }
    else { pCode.style.display = 'none'; }
    
    const childrenList = document.getElementById('profile-linked-children-list');
    if(currentUser.linkedChildren && currentUser.linkedChildren.length > 0) {
        childrenList.innerHTML = "Enfants liés : " + currentUser.linkedChildren.map(cId => {
            const c = clubMembers.find(u=>u.id===cId); return c ? `<span style="background:var(--bg-color); padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(c.username)}</span>` : '';
        }).join('');
    } else { childrenList.innerHTML = ''; }

    renderProfileClubs();
    renderMyRoleRequests();

    document.getElementById('athlete-competitions-list').innerHTML = (currentUser.profile.competitions && currentUser.profile.competitions.length > 0) ? currentUser.profile.competitions.map((c, idx) => `
        <div class="comp-item" style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;">
            <div style="flex:1;">
                <b>${escapeHtml(c.type)}</b> - ${escapeHtml(c.place)}<br>
                <span style="font-size:0.9rem; color:var(--text-muted);">${escapeHtml(c.feeling)}</span>
            </div>
            <div style="display:flex; gap:0.25rem; align-items:center;">
                <button class="btn-icon" title="Modifier" onclick="openEditCompetition(${idx})">✏️</button>
                <button class="btn-icon" style="color:var(--danger);" title="Supprimer" onclick="deleteCompetition(${idx})">🗑️</button>
            </div>
        </div>
    `).join('') : "<p style='color:var(--text-muted);'>Aucune compétition enregistrée.</p>";

    renderRadarChart('chart-t1-athlete', currentUser.profile.skillsT1, "Technique & Gestuelle", 'rgba(0, 85, 164, 0.5)');
    renderRadarChart('chart-t2-athlete', currentUser.profile.skillsT2, 'Physique & Mental', 'rgba(239, 68, 68, 0.5)');
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

async function handleClubAvatarUpload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if(!file || !currentUser.clubId) return;

    try {
        const avatar = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Impossible de lire l'image."));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error("Le fichier sélectionné n'est pas une image valide."));
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = 250;
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, size, size);
                    const minDim = Math.min(img.width, img.height);
                    ctx.drawImage(img, (img.width - minDim) / 2, (img.height - minDim) / 2, minDim, minDim, 0, 0, size, size);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });

        await db.collection('clubs').doc(currentUser.clubId).update({ avatar });
        const club = allClubs.find(item => item.id === currentUser.clubId);
        if(club) club.avatar = avatar;
        renderCoachAthletes();
    } catch(error) {
        console.error("Erreur mise à jour de la photo du club:", error);
        alert("Impossible de modifier la photo du club : " + error.message);
    }
}

function openCompModal() {
    editingCompIndex = null;
    const titleEl = document.getElementById('modal-comp-title-text');
    if(titleEl) titleEl.textContent = "Ajouter une compétition";
    document.getElementById('comp-type').value = '';
    document.getElementById('comp-place').value = '';
    document.getElementById('comp-feeling').value = '';
    openModal('modal-competition');
}

function openEditCompetition(idx) {
    editingCompIndex = idx;
    const c = currentUser.profile.competitions[idx];
    if(!c) return;
    const titleEl = document.getElementById('modal-comp-title-text');
    if(titleEl) titleEl.textContent = "Modifier la compétition";
    document.getElementById('comp-type').value = c.type || '';
    document.getElementById('comp-place').value = c.place || '';
    document.getElementById('comp-feeling').value = c.feeling || '';
    openModal('modal-competition');
}
async function saveCompetition() {
    const type = document.getElementById('comp-type').value.trim(); 
    const place = document.getElementById('comp-place').value.trim(); 
    const feeling = document.getElementById('comp-feeling').value.trim();
    if(!type) return alert("Veuillez indiquer le type de compétition.");
    
    if(!currentUser.profile.competitions) currentUser.profile.competitions = [];
    
    if(editingCompIndex !== null && currentUser.profile.competitions[editingCompIndex]) {
        currentUser.profile.competitions[editingCompIndex].type = type;
        currentUser.profile.competitions[editingCompIndex].place = place;
        currentUser.profile.competitions[editingCompIndex].feeling = feeling;
    } else {
        currentUser.profile.competitions.push({ type, place, feeling, date: Date.now() });
    }
    
    await db.collection('users').doc(currentUser.id).update({ 'profile.competitions': currentUser.profile.competitions });
    closeModal('modal-competition'); 
    renderAthleteProfile();
}

async function deleteCompetition(idx) {
    if(!await showAppConfirm("Êtes-vous sûr de vouloir supprimer cette compétition ?")) return;
    currentUser.profile.competitions.splice(idx, 1);
    await db.collection('users').doc(currentUser.id).update({ 'profile.competitions': currentUser.profile.competitions });
    renderAthleteProfile();
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
    chartInstances[canvasId] = new Chart(ctx, { 
        type: 'radar', 
        data: { 
            labels: Object.keys(dataObj), 
            datasets: [{ 
                label, 
                data: Object.values(dataObj), 
                backgroundColor: color, 
                borderColor: color.replace('0.5', '1'), 
                borderWidth: 2,
                pointBackgroundColor: color.replace('0.5', '1'),
                pointBorderColor: '#FFFFFF',
                pointRadius: 3
            }] 
        }, 
        options: { 
            scales: { 
                r: { 
                    min: 0, 
                    max: 10, 
                    ticks: { display: false, stepSize: 2 },
                    grid: { color: 'rgba(203, 213, 225, 0.6)' },
                    angleLines: { color: 'rgba(203, 213, 225, 0.6)' },
                    pointLabels: {
                        font: { size: 11, weight: '600', family: "'Inter', sans-serif" },
                        color: '#475569'
                    }
                } 
            }, 
            plugins: {
                legend: {
                    labels: {
                        font: { size: 12, weight: '700', family: "'Inter', sans-serif" },
                        color: '#0F172A'
                    }
                }
            },
            maintainAspectRatio: false 
        }
    });
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
            if(assign) { const sess = clubSessions.find(s => s.id === assign.sessionId); if(sess) sHtml = `<div class="cal-session-indicator">${escapeHtml(sess.name)}</div>`; }
        }
        html += `<div class="${cls}" onclick="openCalNote('${dStr(d)}')"><span class="day-number">${d}</span>${sHtml}${data?.note ? `<div class="cal-note-indicator">${escapeHtml(data.note)}</div>` : ''}</div>`;
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
        const s = getAssignmentSession(a);
        if(s) select.innerHTML += `<option value="${escapeHtml(a.id)}" ${a.id === data.assignmentId ? 'selected' : ''}>${a.isDone?'[Validée] ':''}${escapeHtml(s.name)}</option>`; 
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
        const aCoach = hasCoachRights(a);
        const bCoach = hasCoachRights(b);
        if(aCoach && !bCoach) return -1;
        if(!aCoach && bCoach) return 1;
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
        let avatar = u.profile.avatar ? `<img src="${escapeHtml(u.profile.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '👤';
        return `<div class="chat-user-item" onclick="openConversation('${escapeHtml(u.id)}')">
                    <div class="avatar">${avatar}</div>
                    <div class="details"><span class="name">${escapeHtml(u.username)}</span><span class="role">${escapeHtml(getRoleLabel(getClubRole(u)))}</span>${lastMsgStr ? `<span class="last-msg">${escapeHtml(lastMsgStr)}</span>` : ''}</div>
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
        return `<div class="chat-msg ${isMe ? 'msg-me' : 'msg-them'}">${escapeHtml(m.text)}<span class="date">${escapeHtml(dateStr)}</span></div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const text = document.getElementById('chat-input-text').value.trim();
    if(!text || !activeChatUserId) return;
    if(text.length > 10000) return alert("Le message ne peut pas dépasser 10 000 caractères.");
    try {
        await db.collection('messages').add({ clubId: currentUser.clubId, senderId: currentUser.id, receiverId: activeChatUserId, text, date: Date.now() });
        document.getElementById('chat-input-text').value = '';
    } catch(error) {
        console.error("Erreur d'envoi du message:", error);
        alert("Impossible d'envoyer le message : " + error.message);
    }
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
