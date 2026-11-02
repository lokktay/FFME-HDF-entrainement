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
let adminUsageChart = null;
let adminMetricsGeneration = 0;
let adminManagedClubId = null;
let adminReturnClubId = null;

let currentMonth = new Date().getMonth(); let currentYear = new Date().getFullYear();
let selectedDateForNote = null; let selectedUserIdForCalendar = null;
let editingBlockId = null; let editingSessionId = null; let builderBlocks = [];
let isSavingSession = false;
let viewedAssignmentId = null; // Déclarée UNE SEULE FOIS ici
let currentSessionFilter = 'Toutes'; let coachBlockSearch = ''; let coachSessionSearch = ''; 
let coachBlockFilter = 'Toutes'; let currentSessionLibraryTab = 'personal'; 
let activeChatUserId = null; let editingGroupId = null; let editingCompIndex = null;
let groupEditorSelectedIds = new Set();
let groupEditorAvatar = null;
let assignmentSelectedIds = new Set();
let assignmentPendingAthleteIds = new Set();
let viewedBlockId = null;
let linkedChildIds = [];
let linkedParentIds = [];
let currentUserParentCode = null;
const parentLinkCodeCache = new Map();
let authBootstrapInProgress = false;
const parentLinkCodeAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
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

function isCurrentUserMemberOfClub(clubId) {
    if(adminManagedClubId && currentUser && currentUser.id === auth.currentUser?.uid) {
        const clubIds = Array.isArray(currentUser.clubIds) ? [...currentUser.clubIds] : [];
        if(adminReturnClubId && !clubIds.includes(adminReturnClubId)) clubIds.push(adminReturnClubId);
        return clubIds.includes(clubId);
    }
    return getUserClubIds().includes(clubId);
}

async function recordLoginUsageEvent() {
    if(!currentUser || isPlatformAdmin()) return;
    try {
        await db.collection('usageEvents').add({
            type: 'login',
            actorId: currentUser.id,
            clubIds: Array.isArray(currentUser.clubIds)
                ? [...new Set(currentUser.clubIds)]
                : (currentUser.clubId ? [currentUser.clubId] : []),
            occurredAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(error) {
        console.error("Échec de l'enregistrement de l'activité de connexion pour les statistiques de la plateforme:", error);
    }
}

function addSessionCreationUsageEvent(batch, session) {
    batch.set(db.collection('usageEvents').doc(), {
        type: 'session_created',
        actorId: currentUser.id,
        clubId: session.clubId,
        sourceId: session.id,
        occurredAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function getPrivateProfileRef(userId) {
    return db.collection('users').doc(userId).collection('private').doc('profile');
}

function getClubDirectoryRef(clubId, userId) {
    return db.collection('clubs').doc(clubId).collection('members').doc(userId);
}

function getClubRoleForUser(user, clubId) {
    const club = allClubs.find(item => item.id === clubId);
    if(club && Array.isArray(club.managerIds) && club.managerIds.includes(user.id)) return 'gerant';
    if(user.clubRoles && user.clubRoles[clubId]) return user.clubRoles[clubId];
    const legacyCoachClubId = user.primaryClubId || user.clubId;
    return user.role === 'coach' && legacyCoachClubId === clubId ? 'coach' : 'athlete';
}

function getDirectoryRoleFromUser(user, clubId) {
    if(user.clubRoles && user.clubRoles[clubId]) return user.clubRoles[clubId];
    const legacyCoachClubId = user.primaryClubId || user.clubId;
    return user.role === 'coach' && legacyCoachClubId === clubId ? 'coach' : 'athlete';
}

function getDirectoryEntry(user, clubId, role = getClubRoleForUser(user, clubId)) {
    return {
        userId: user.id,
        username: user.username || '',
        avatar: user.avatar || null,
        role,
        clubId
    };
}

async function loadPrivateProfile(userId) {
    const snapshot = await getPrivateProfileRef(userId).get();
    return snapshot.exists ? snapshot.data() : null;
}

async function savePrivateProfile(userId, updates) {
    await getPrivateProfileRef(userId).update(updates);
}

async function migrateLegacyPrivateData(user) {
    const userRef = db.collection('users').doc(user.id);
    const privateRef = getPrivateProfileRef(user.id);
    const privateSnapshot = await privateRef.get();
    const legacyProfile = user.profile && typeof user.profile === 'object' ? user.profile : null;
    const needsProfileMigration = !privateSnapshot.exists ||
        !privateSnapshot.data().profile || user.email || user.dob || legacyProfile || user.parentCode;
    if(!needsProfileMigration) {
        const privateData = privateSnapshot.data() || {};
        return {
            ...user,
            ...privateData,
            profile: { ...getEmptyProfile(), ...(privateData.profile || {}) }
        };
    }

    const existingPrivate = privateSnapshot.exists ? privateSnapshot.data() : {};
    const profile = existingPrivate.profile || legacyProfile || getEmptyProfile();
    const privateData = {
        email: existingPrivate.email || user.email || (auth.currentUser && auth.currentUser.email) || '',
        dob: existingPrivate.dob || user.dob || '',
        profile
    };
    const updates = {};
    ['email', 'dob', 'profile', 'parentCode'].forEach(field => {
        if(field in user) updates[field] = firebase.firestore.FieldValue.delete();
    });
    if(!user.avatar && profile.avatar) updates.avatar = profile.avatar;

    const batch = db.batch();
    batch.set(privateRef, privateData);
    if(Object.keys(updates).length) batch.update(userRef, updates);
    await batch.commit();
    const migratedUser = { ...user, avatar: user.avatar || profile.avatar };
    delete migratedUser.email;
    delete migratedUser.dob;
    delete migratedUser.profile;
    delete migratedUser.parentCode;
    return {
        ...migratedUser,
        ...privateData,
        profile: { ...getEmptyProfile(), ...privateData.profile }
    };
}

async function syncClubDirectory(user, clubIds = getUserClubIds(user)) {
    if(!user || !user.id) return;
    const uniqueClubIds = [...new Set(clubIds.filter(Boolean))];
    const batch = db.batch();
    const entries = await Promise.all(uniqueClubIds.map(async clubId => {
        const clubSnapshot = await db.collection('clubs').doc(clubId).get();
        const isManager = clubSnapshot.exists && (clubSnapshot.data().managerIds || []).includes(user.id);
        const entry = getDirectoryEntry(user, clubId, isManager ? 'gerant' : getDirectoryRoleFromUser(user, clubId));
        return { clubId, entry };
    }));
    entries.forEach(({ clubId, entry }) => batch.set(getClubDirectoryRef(clubId, user.id), entry));
    if(uniqueClubIds.length) await batch.commit();
}

async function backfillClubDirectory(clubId, member, legacyPrivateData = null) {
    if(!member || !member.id || !getUserClubIds(member).includes(clubId)) return;
    const directoryRef = getClubDirectoryRef(clubId, member.id);
    const directorySnapshot = await directoryRef.get();
    const clubSnapshot = await db.collection('clubs').doc(clubId).get();
    const isManager = clubSnapshot.exists && (clubSnapshot.data().managerIds || []).includes(member.id);
    const entry = getDirectoryEntry(
        member,
        clubId,
        isManager ? 'gerant' : getDirectoryRoleFromUser(member, clubId)
    );
    if(!directorySnapshot.exists ||
        directorySnapshot.data().username !== entry.username ||
        directorySnapshot.data().avatar !== entry.avatar ||
        directorySnapshot.data().role !== entry.role) {
        await directoryRef.set(entry);
    }

    const hasLegacyPrivateData = legacyPrivateData &&
        ['email', 'dob', 'profile'].some(field => Object.prototype.hasOwnProperty.call(legacyPrivateData, field));
    if(hasLegacyPrivateData && !(await getPrivateProfileRef(member.id).get()).exists) {
        await getPrivateProfileRef(member.id).set({
            email: legacyPrivateData.email || '',
            dob: legacyPrivateData.dob || '',
            profile: legacyPrivateData.profile && typeof legacyPrivateData.profile === 'object'
                ? legacyPrivateData.profile
                : {}
        });
    }
}

function createParentLinkCode() {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => parentLinkCodeAlphabet[byte & 31]).join('');
}

function isValidParentLinkCode(code) {
    return typeof code === 'string' && /^[0-9A-HJKMNPQRSTVWXYZ]{10}$/.test(code);
}

async function ensureParentLinkCode(userId, legacyParentCode = null) {
    const userRef = db.collection('users').doc(userId);
    const privateCodeRef = userRef.collection('private').doc('parentLinkCode');
    let code = await db.runTransaction(async transaction => {
        const codeSnapshot = await transaction.get(privateCodeRef);
        const existingCode = codeSnapshot.exists ? codeSnapshot.data().code : null;
        const existingCodeRef = isValidParentLinkCode(existingCode) ||
            (typeof existingCode === 'string' && /^[a-f0-9]{64}$/.test(existingCode))
            ? db.collection('parentLinkCodes').doc(existingCode)
            : null;
        const existingCodeSnapshot = existingCodeRef
            ? await transaction.get(existingCodeRef)
            : null;
        if(isValidParentLinkCode(existingCode) &&
            existingCodeSnapshot && existingCodeSnapshot.exists &&
            existingCodeSnapshot.data().childId === userId &&
            !existingCodeSnapshot.data().usedBy) return existingCode;

        const legacyCodeRef = legacyParentCode &&
            (isValidParentLinkCode(legacyParentCode) || /^[a-f0-9]{64}$/.test(legacyParentCode)) &&
            legacyParentCode !== existingCode
            ? db.collection('parentLinkCodes').doc(legacyParentCode)
            : null;
        const legacyCodeSnapshot = legacyCodeRef
            ? await transaction.get(legacyCodeRef)
            : null;

        const newCode = createParentLinkCode();
        const codeRef = db.collection('parentLinkCodes').doc(newCode);
        const newCodeSnapshot = await transaction.get(codeRef);
        if(newCodeSnapshot.exists) throw new Error("Collision de code parent, veuillez réessayer.");

        transaction.set(codeRef, { childId: userId, createdAt: Date.now() });
        transaction.set(privateCodeRef, { code: newCode });
        if(existingCodeRef && existingCodeSnapshot && existingCodeSnapshot.exists &&
            existingCodeSnapshot.data().childId === userId &&
            !existingCodeSnapshot.data().usedBy) {
            transaction.delete(existingCodeRef);
        }
        if(legacyCodeRef && legacyCodeSnapshot && legacyCodeSnapshot.exists &&
            legacyCodeSnapshot.data().childId === userId &&
            !legacyCodeSnapshot.data().usedBy) {
            transaction.delete(legacyCodeRef);
        }
        return newCode;
    });

    if(legacyParentCode) {
        await userRef.update({ parentCode: firebase.firestore.FieldValue.delete() });
    }
    parentLinkCodeCache.set(userId, code);
    return code;
}

async function loadLinkedChildIds(parentId) {
    const snapshot = await db.collection('users').doc(parentId).collection('linkedChildren').get();
    return loadVerifiedParentLinks(snapshot.docs, parentId, true);
}

async function loadLinkedParentIds(childId) {
    const snapshot = await db.collection('users').doc(childId).collection('linkedParents').get();
    return loadVerifiedParentLinks(snapshot.docs, childId, false);
}

async function loadVerifiedParentLinks(documents, ownerId, isParent) {
    const verifiedIds = await Promise.all(documents.map(async doc => {
        const link = doc.data();
        const parentId = isParent ? ownerId : doc.id;
        const childId = isParent ? doc.id : ownerId;
        if(link.parentId !== parentId || link.childId !== childId ||
            typeof link.codeId !== 'string' ||
            !(isValidParentLinkCode(link.codeId) || /^[a-f0-9]{64}$/.test(link.codeId))) return null;

        const counterpartRef = isParent
            ? db.collection('users').doc(childId).collection('linkedParents').doc(parentId)
            : db.collection('users').doc(parentId).collection('linkedChildren').doc(childId);
        const [counterpartSnapshot, codeSnapshot] = await Promise.all([
            counterpartRef.get(),
            db.collection('parentLinkCodes').doc(link.codeId).get()
        ]);
        if(!counterpartSnapshot.exists || !codeSnapshot.exists) return null;
        const counterpart = counterpartSnapshot.data();
        const code = codeSnapshot.data();
        return counterpart.parentId === parentId &&
            counterpart.childId === childId &&
            counterpart.codeId === link.codeId &&
            code.childId === childId &&
            code.usedBy === parentId
            ? (isParent ? childId : parentId)
            : null;
    }));
    return verifiedIds.filter(Boolean);
}

async function createParentChildLink(parentId, code, requiredClubId) {
    code = String(code || '').trim().toUpperCase();
    if(!isValidParentLinkCode(code)) {
        throw new Error("Le code de liaison doit comporter 10 caractères.");
    }

    const codeSnapshot = await db.collection('parentLinkCodes').doc(code).get();
    if(!codeSnapshot.exists || codeSnapshot.data().usedBy) throw new Error("Code invalide ou déjà utilisé.");
    const childId = codeSnapshot.data().childId;
    if(!childId || childId === parentId) throw new Error("Ce code ne peut pas être utilisé pour ce compte.");

    const directorySnapshot = requiredClubId
        ? await getClubDirectoryRef(requiredClubId, childId).get()
        : null;
    if(!directorySnapshot || !directorySnapshot.exists) {
        throw new Error("L'enfant doit également être membre de votre club actif.");
    }

    const parentLinkRef = db.collection('users').doc(parentId).collection('linkedChildren').doc(childId);
    const childLinkRef = db.collection('users').doc(childId).collection('linkedParents').doc(parentId);
    const [existingParentLink, existingChildLink] = await Promise.all([
        parentLinkRef.get(),
        childLinkRef.get()
    ]);
    if(existingParentLink.exists && existingChildLink.exists) {
        const parentLink = existingParentLink.data();
        const childLink = existingChildLink.data();
        if(typeof parentLink.codeId === 'string' &&
            (isValidParentLinkCode(parentLink.codeId) || /^[a-f0-9]{64}$/.test(parentLink.codeId)) &&
            parentLink.parentId === parentId && parentLink.childId === childId &&
            parentLink.codeId === childLink.codeId && childLink.parentId === parentId &&
            childLink.childId === childId) {
            const existingCodeSnapshot = await db.collection('parentLinkCodes').doc(parentLink.codeId).get();
            if(existingCodeSnapshot.exists &&
                existingCodeSnapshot.data().childId === childId &&
                existingCodeSnapshot.data().usedBy === parentId) return childId;
        }
    }
    if(existingParentLink.exists || existingChildLink.exists) {
        await removeParentChildLink(parentId, childId);
    }

    const linkData = { parentId, childId, codeId: code, createdAt: Date.now() };
    const batch = db.batch();
    batch.update(db.collection('parentLinkCodes').doc(code), { usedBy: parentId });
    batch.set(parentLinkRef, linkData);
    batch.set(childLinkRef, linkData);
    await batch.commit();
    return childId;
}

async function removeParentChildLink(parentId, childId) {
    const parentLinkRef = db.collection('users').doc(parentId).collection('linkedChildren').doc(childId);
    const childLinkRef = db.collection('users').doc(childId).collection('linkedParents').doc(parentId);
    if(auth.currentUser && auth.currentUser.uid === childId) {
        const childLinkSnapshot = await childLinkRef.get();
        if(!childLinkSnapshot.exists) return;
        const childBatch = db.batch();
        childBatch.delete(childLinkRef);
        childBatch.delete(parentLinkRef);
        await childBatch.commit();
        return;
    }

    const [parentLinkSnapshot, childLinkSnapshot] = await Promise.all([
        parentLinkRef.get(),
        childLinkRef.get()
    ]);
    const batch = db.batch();
    if(parentLinkSnapshot.exists) batch.delete(parentLinkRef);
    if(childLinkSnapshot.exists) batch.delete(childLinkRef);
    if(parentLinkSnapshot.exists || childLinkSnapshot.exists) await batch.commit();
}

function getClubRole(user = currentUser, clubId = currentUser && currentUser.clubId) {
    if(!user || !clubId) return 'athlete';
    if(isVirtualAdminManager(user, clubId)) return 'gerant';
    if(originalParentUser && user.id === currentUser.id) return 'athlete';
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

function isPlatformAdmin(user = currentUser) {
    return Boolean(user && user.isPlatformAdmin);
}

function isVirtualAdminManager(user = currentUser, clubId = currentUser && currentUser.clubId) {
    return Boolean(isPlatformAdmin(user) && adminManagedClubId && adminManagedClubId === clubId);
}

function isClubManager(user = currentUser, clubId = currentUser && currentUser.clubId) {
    return isVirtualAdminManager(user, clubId) || getClubRole(user, clubId) === 'gerant';
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
    const isViewingChild = Boolean(originalParentUser);
    clubsList.innerHTML = myClubs.map(club => `
        <div class="club-membership-item">
            <div><strong>${escapeHtml(club.name)}</strong>${currentUser.clubId === club.id ? '<span class="club-current-badge">Club actif</span>' : ''}</div>
            ${isViewingChild ? '' : `<div class="club-membership-actions">
                ${currentUser.clubId !== club.id ? `<button class="btn-outline" onclick="setActiveClub('${escapeHtml(club.id)}')">Utiliser ce club</button>` : ''}
                <button class="btn-outline" style="color:var(--danger);" onclick="leaveClub('${escapeHtml(club.id)}')">Quitter</button>
            </div>`}
        </div>
    `).join('') || '<p style="color:var(--text-muted);">Vous n’êtes membre d’aucun club.</p>';

    const clubManagementPanel = clubSelect.closest('.club-management-panel');
    if(clubManagementPanel) clubManagementPanel.style.display = isViewingChild ? 'none' : '';
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
        const updatedMember = {
            ...member,
            clubRoles: { ...(member.clubRoles || {}), [currentUser.clubId]: role }
        };
        batch.set(getClubDirectoryRef(currentUser.clubId, memberId), {
            ...getDirectoryEntry(updatedMember, currentUser.clubId),
            role
        });
        if(role === 'gerant') {
            const managerIdsToAdd = isVirtualAdminManager() ? [memberId] : [currentUser.id, memberId];
            batch.update(db.collection('clubs').doc(currentUser.clubId), {
                managerIds: firebase.firestore.FieldValue.arrayUnion(...managerIdsToAdd)
            });
        } else if(oldRole === 'gerant') {
            const managerIds = [...new Set([
                ...(getMyClubObj().managerIds || []),
                ...(!isVirtualAdminManager() ? [currentUser.id] : [])
            ])]
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
            const updatedMember = {
                ...member,
                clubRoles: { ...(member.clubRoles || {}), [currentUser.clubId]: request.requestedRole }
            };
            batch.set(getClubDirectoryRef(currentUser.clubId, member.id), {
                ...getDirectoryEntry(updatedMember, currentUser.clubId),
                role: request.requestedRole
            });
            if(request.requestedRole === 'gerant') {
                const managerIdsToAdd = isVirtualAdminManager() ? [member.id] : [currentUser.id, member.id];
                batch.update(db.collection('clubs').doc(currentUser.clubId), {
                    managerIds: firebase.firestore.FieldValue.arrayUnion(...managerIdsToAdd)
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
    if(originalParentUser) return alert("Revenez au compte parent pour modifier l'adhésion à un club.");
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
    if(originalParentUser) return alert("Revenez au compte parent pour modifier l'adhésion à un club.");
    const clubId = document.getElementById('available-clubs-select').value;
    if(!clubId) return alert("Sélectionnez un club.");
    if(clubId === '_new_') return;
    const clubIds = getUserClubIds();
    if(clubIds.includes(clubId)) return alert("Vous êtes déjà membre de ce club.");
    clubIds.push(clubId);
    const updates = { clubIds };
    if(!currentUser.clubId) updates.clubId = clubId;
    try {
        const batch = db.batch();
        batch.update(db.collection('users').doc(currentUser.id), updates);
        const updatedUser = { ...currentUser, ...updates };
        batch.set(getClubDirectoryRef(clubId, currentUser.id), getDirectoryEntry(updatedUser, clubId));
        await batch.commit();
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
    if(originalParentUser) return alert("Revenez au compte parent pour créer un club.");
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
        const updatedUser = { ...currentUser, clubIds, clubId: club.id };
        batch.set(getClubDirectoryRef(club.id, currentUser.id), {
            ...getDirectoryEntry(updatedUser, club.id),
            role: 'gerant'
        });
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
    if(originalParentUser) return alert("Revenez au compte parent pour modifier l'adhésion à un club.");
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
        const batch = db.batch();
        batch.update(db.collection('users').doc(currentUser.id), { clubIds, clubId: nextClubId });
        batch.delete(getClubDirectoryRef(clubId, currentUser.id));
        await batch.commit();
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

async function startAuthenticatedSession(user) {
    if(authBootstrapInProgress) return;
    authBootstrapInProgress = true;
    document.getElementById('loader-screen').style.display = 'flex';

    try {
        if(!user.emailVerified) {
            document.getElementById('loader-screen').style.display = 'none';
            await auth.signOut();
            alert("Veuillez valider votre adresse email en cliquant sur le lien reçu, puis reconnectez-vous.");
            initAuthUI();
            return;
        }

        const tokenResult = await user.getIdTokenResult(true);
        const userSnapshot = await db.collection('users').doc(user.uid).get();
        if(!userSnapshot.exists) {
            document.getElementById('loader-screen').style.display = 'none';
            await auth.signOut();
            alert("Profil introuvable. Votre compte a été mal créé. Veuillez vous réinscrire.");
            initAuthUI();
            return;
        }

        currentUser = await migrateLegacyPrivateData({ ...userSnapshot.data(), id: userSnapshot.id });
        currentUser.isPlatformAdmin = tokenResult.claims.admin === true;
        await syncClubDirectory(currentUser);
        await recordLoginUsageEvent();
        currentUserParentCode = null;
        originalParentUser = null;
        let parentLinkRulesAvailable = true;
        try {
            linkedChildIds = await loadLinkedChildIds(user.uid);
            linkedParentIds = await loadLinkedParentIds(user.uid);
        } catch(error) {
            if(error.code !== 'permission-denied') throw error;
            linkedChildIds = [];
            linkedParentIds = [];
            parentLinkRulesAvailable = false;
            console.error("Les règles Firestore de liaison parent-enfant ne sont pas encore publiées.", error);
            alert("La liaison parent-enfant sécurisée sera disponible après la publication des nouvelles règles Firebase. Le reste du compte reste accessible.");
        }
        const age = currentUser.dob
            ? (new Date() - new Date(currentUser.dob)) / (1000*60*60*24*365.25)
            : 18;
        if(parentLinkRulesAvailable && (age < 18 || currentUser.parentCode || linkedParentIds.length > 0)) {
            try {
                currentUserParentCode = await ensureParentLinkCode(user.uid, currentUser.parentCode);
            } catch(error) {
                if(error.code !== 'permission-denied') throw error;
                console.error("Les règles Firestore empêchent la création du code parent sécurisé.", error);
                alert("La génération du code parent sera disponible après la publication des nouvelles règles Firebase.");
            }
        }

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
    } catch(error) {
        document.getElementById('loader-screen').style.display = 'none';
        stopRealtimeListeners();
        currentUser = null;
        adminManagedClubId = null;
        adminReturnClubId = null;
        originalParentUser = null;
        linkedChildIds = [];
        linkedParentIds = [];
        currentUserParentCode = null;
        const rulesHint = error.code === 'permission-denied'
            ? " Les règles Firestore déployées ne correspondent peut-être pas à cette version du site."
            : "";
        console.error("Erreur d'initialisation de la session Firebase:", error);
        alert("Impossible de charger votre compte : " + error.message + rulesHint +
            " Votre session reste active ; réessayez avec « Se connecter » après vérification de la connexion ou des règles.");
        initAuthUI();
    } finally {
        authBootstrapInProgress = false;
    }
}

// === INITIALISATION ET ÉCOUTEURS TEMPS RÉEL ===
function initApp() {
    db.collection('clubs').onSnapshot(snap => {
        allClubs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if(document.getElementById('auth-screen').style.display !== 'none') updateAuthClubList();
        else refreshCurrentTab();
    }, error => {
        console.error("Erreur de chargement des clubs:", error);
    });

    auth.onAuthStateChanged(user => {
        if(isRegistering) return;

        if(user) {
            startAuthenticatedSession(user);
            return;
        }

        stopRealtimeListeners();
        currentUser = null;
        originalParentUser = null;
        linkedChildIds = [];
        linkedParentIds = [];
        currentUserParentCode = null;
        document.getElementById('loader-screen').style.display = 'none';
        initAuthUI();
    });
}

let listeners = [];
let realtimeListenerGeneration = 0;
const sessionAccessSyncInFlight = new Set();
const reportedRealtimeErrors = new Set();
let sessionAccessSyncFailedGeneration = null;

function stopRealtimeListeners() {
    realtimeListenerGeneration++;
    listeners.forEach(unsubscribe => unsubscribe());
    listeners = [];
}

function handleRealtimeListenerError(label, generation, error) {
    if(generation !== realtimeListenerGeneration || !auth.currentUser) return;
    console.error(`Erreur de synchronisation ${label}:`, error);
    const errorKey = `${generation}:${error.code || error.name || 'unknown'}`;
    if(reportedRealtimeErrors.has(errorKey)) return;
    reportedRealtimeErrors.add(errorKey);

    const reason = error.code === 'permission-denied' && label === "les accès aux séances attribuées"
        ? "Firebase a refusé la synchronisation des anciennes attributions. Vérifiez que les règles Firestore publiées correspondent à cette version du site."
        : error.code === 'permission-denied'
            ? "Firebase a refusé l'accès. Vérifiez que les règles Firestore publiées correspondent à cette version du site."
        : error.message;
    alert(`La synchronisation de ${label} a rencontré une erreur : ${reason} Les détails sont disponibles dans la console du navigateur.`);
}

async function loadAssignedAthleteSessions(assignments, clubId, generation) {
    if(!currentUser || originalParentUser || hasCoachRights(currentUser, clubId)) return;
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

async function syncAssignedSessionAccess(assignments, clubId, generation) {
    if(!currentUser || !hasCoachRights(currentUser, clubId) ||
        sessionAccessSyncFailedGeneration === generation) return;
    const athletesBySession = new Map();
    const assignmentsBySession = new Map();
    assignments.filter(assignment =>
        assignment.clubId === clubId && assignment.sessionId && assignment.athleteId
    ).forEach(assignment => {
        if(!athletesBySession.has(assignment.sessionId)) athletesBySession.set(assignment.sessionId, new Set());
        athletesBySession.get(assignment.sessionId).add(assignment.athleteId);
        if(!assignmentsBySession.has(assignment.sessionId)) assignmentsBySession.set(assignment.sessionId, []);
        assignmentsBySession.get(assignment.sessionId).push(assignment);
    });

    const sessionsToSync = [...athletesBySession.entries()].filter(([sessionId]) => {
        if(!isClubManager(currentUser, clubId) && !clubSessions.some(session => session.id === sessionId)) return false;
        const key = `${clubId}:${sessionId}`;
        if(sessionAccessSyncInFlight.has(key)) return false;
        sessionAccessSyncInFlight.add(key);
        return true;
    });
    if(sessionsToSync.length === 0) return;

    try {
        const snapshots = await Promise.all(sessionsToSync.map(async ([sessionId]) => {
            const cachedSession = clubSessions.find(session => session.id === sessionId);
            if(cachedSession) return { ref: db.collection('sessions').doc(sessionId), data: cachedSession };
            const snapshot = await db.collection('sessions').doc(sessionId).get();
            return snapshot.exists ? { ref: snapshot.ref, data: { id: snapshot.id, ...snapshot.data() } } : null;
        }));
        if(generation !== realtimeListenerGeneration || !auth.currentUser) return;

        const updates = snapshots.map((session, index) => {
            if(!session || session.data.clubId !== clubId) return null;
            const [sessionId, athleteIds] = sessionsToSync[index];
            const existingIds = new Set(session.data.assignedAthleteIds || []);
            const missingIds = [...athleteIds].filter(athleteId => !existingIds.has(athleteId));
            return { key: `${clubId}:${sessionId}`, ref: session.ref, missingIds, data: session.data };
        }).filter(Boolean);

        for(const update of updates) {
            const writes = [];
            if(update.missingIds.length) {
                writes.push({ ref: update.ref, data: {
                    assignedAthleteIds: firebase.firestore.FieldValue.arrayUnion(...update.missingIds)
                }});
            }
            const missingSnapshots = assignmentsBySession.get(update.data.id)
                .filter(assignment => !assignment.sessionSnapshot);
            if(missingSnapshots.length) {
                const sessionSnapshot = await createAssignedSessionSnapshot(update.data);
                missingSnapshots.forEach(assignment => {
                    writes.push({
                        ref: db.collection('assignments').doc(assignment.id),
                        data: { sessionSnapshot }
                    });
                });
            }

            for(let index = 0; index < writes.length; index += 450) {
                const batch = db.batch();
                writes.slice(index, index + 450).forEach(write => batch.update(write.ref, write.data));
                await batch.commit();
            }
        }
    } catch(error) {
        if(error.code === 'permission-denied') {
            sessionAccessSyncFailedGeneration = generation;
        }
        handleRealtimeListenerError("les accès aux séances attribuées", generation, error);
    } finally {
        sessionsToSync.forEach(([sessionId]) => sessionAccessSyncInFlight.delete(`${clubId}:${sessionId}`));
    }
}

function startRealtimeListeners(clubId) {
    stopRealtimeListeners();
    const listenerGeneration = realtimeListenerGeneration;
    reportedRealtimeErrors.clear();
    sessionAccessSyncFailedGeneration = null;
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

    let directoryMembers = [];
    let legacyMembers = [];
    let multiClubMembers = [];
    let managerSessions = [];
    let coachSessions = [];
    let sharedSessions = [];
    const updateClubSessions = () => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        const sessionsById = new Map([...managerSessions, ...coachSessions, ...sharedSessions].map(session => [session.id, session]));
        clubSessions = [...sessionsById.values()];
        refreshCurrentTab();
        syncAssignedSessionAccess(clubAssignments, clubId, listenerGeneration);
    };
    const updateClubMembers = () => {
        if(listenerGeneration !== realtimeListenerGeneration || !currentUser || !auth.currentUser) return;
        const membersById = new Map(directoryMembers.map(member => [member.id, member]));
        [...legacyMembers, ...multiClubMembers].forEach(member => {
            membersById.set(member.id, { ...membersById.get(member.id), ...member });
        });
        if(currentUser && isCurrentUserMemberOfClub(clubId)) {
            membersById.set(currentUser.id, { ...membersById.get(currentUser.id), ...currentUser });
        }
        clubMembers = [...membersById.values()];
        const updatedMe = clubMembers.find(u => u.id === currentUser.id);
        if(updatedMe && !originalParentUser) {
            currentUser = {
                ...currentUser,
                ...updatedMe,
                email: currentUser.email,
                dob: currentUser.dob,
                profile: currentUser.profile
            };
            const currentMemberIndex = clubMembers.findIndex(member => member.id === currentUser.id);
            clubMembers[currentMemberIndex] = currentUser;
        }
        refreshCurrentTab();
    };

    listeners.push(db.collection('clubs').doc(clubId).collection('members').onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        directoryMembers = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        updateClubMembers();
    }, error => handleRealtimeListenerError("les membres du club", listenerGeneration, error)));

    if(hasCoachRights(currentUser, clubId)) {
        const hydrateMembers = async (documents, source) => {
            try {
                const members = await Promise.all(documents.map(async doc => {
                    const member = { ...doc.data(), id: doc.id };
                    const legacyPrivateData = {};
                    ['email', 'dob', 'profile'].forEach(field => {
                        if(Object.prototype.hasOwnProperty.call(member, field)) {
                            legacyPrivateData[field] = member[field];
                        }
                    });
                    const privateData = await loadPrivateProfile(member.id);
                    const storedProfileAvatar = privateData && privateData.profile && privateData.profile.avatar ||
                        legacyPrivateData.profile && legacyPrivateData.profile.avatar;
                    if(privateData && privateData.profile) member.profile = privateData.profile;
                    else if(!member.profile) member.profile = getEmptyProfile();
                    member.email = privateData ? privateData.email : member.email;
                    member.dob = privateData ? privateData.dob : member.dob;
                    await backfillClubDirectory(clubId, member, privateData ? null : legacyPrivateData);
                    if(!member.avatar && storedProfileAvatar) member.avatar = storedProfileAvatar;
                    return member;
                }));
                if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
                if(source === 'legacy') legacyMembers = members;
                else multiClubMembers = members;
                updateClubMembers();
            } catch(error) {
                handleRealtimeListenerError("les profils privés des membres", listenerGeneration, error);
            }
        };
        listeners.push(db.collection('users').where('clubId', '==', clubId).onSnapshot(
            snap => hydrateMembers(snap.docs, 'legacy'),
            error => handleRealtimeListenerError("les membres du club", listenerGeneration, error)
        ));
        listeners.push(db.collection('users').where('clubIds', 'array-contains', clubId).onSnapshot(
            snap => hydrateMembers(snap.docs, 'multi'),
            error => handleRealtimeListenerError("les membres du club", listenerGeneration, error)
        ));
    }

    if(hasCoachRights(currentUser, clubId)) {
        listeners.push(db.collection('blocks').where('clubId', '==', clubId).onSnapshot(snap => {
            if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
            clubBlocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            refreshCurrentTab();
        }, error => handleRealtimeListenerError("les exercices du club", listenerGeneration, error)));
    }

    const sessionsCollection = db.collection('sessions');
    const handleSessionsSnapshot = (snap, source) => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        const sessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(source === 'manager') managerSessions = sessions;
        else if(source === 'coach') coachSessions = sessions;
        else sharedSessions = sessions;
        updateClubSessions();
    };
    if(isClubManager(currentUser, clubId)) {
        listeners.push(sessionsCollection.where('clubId', '==', clubId).onSnapshot(
            snap => handleSessionsSnapshot(snap, 'manager'),
            error => handleRealtimeListenerError("les séances du club", listenerGeneration, error)
        ));
    } else if(hasCoachRights(currentUser, clubId)) {
        listeners.push(sessionsCollection.where('clubId', '==', clubId)
            .where('authorId', '==', currentUser.id).onSnapshot(
                snap => handleSessionsSnapshot(snap, 'coach'),
                error => handleRealtimeListenerError("vos séances", listenerGeneration, error)
            ));
        listeners.push(sessionsCollection.where('clubId', '==', clubId)
            .where('isShared', '==', true).onSnapshot(
                snap => handleSessionsSnapshot(snap, 'shared'),
                error => handleRealtimeListenerError("les séances partagées du club", listenerGeneration, error)
            ));
    } else {
        listeners.push(sessionsCollection.where('clubId', '==', clubId)
            .where('isShared', '==', true).onSnapshot(
                snap => handleSessionsSnapshot(snap, 'shared'),
                error => handleRealtimeListenerError("les séances partagées du club", listenerGeneration, error)
            ));
    }

    let assignmentsQuery = db.collection('assignments').where('clubId', '==', clubId);
    if(!hasCoachRights(currentUser, clubId)) assignmentsQuery = assignmentsQuery.where('athleteId', '==', currentUser.id);
    listeners.push(assignmentsQuery.onSnapshot(snap => {
        if(listenerGeneration !== realtimeListenerGeneration || !auth.currentUser) return;
        clubAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        refreshCurrentTab();
        loadAssignedAthleteSessions(clubAssignments, clubId, listenerGeneration);
        syncAssignedSessionAccess(clubAssignments, clubId, listenerGeneration);
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
    if(document.getElementById('platform-admin-space').classList.contains('active')) return;
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

function updateAdminPeriodMode() {
    if(!isPlatformAdmin()) return;
    const mode = document.getElementById('admin-period-mode').value;
    document.getElementById('admin-period-month').style.display = mode === 'month' ? '' : 'none';
    document.getElementById('admin-period-year').style.display = mode === 'year' ? '' : 'none';
    loadAdminMetrics();
}

function getAdminPeriodRange() {
    const mode = document.getElementById('admin-period-mode').value;
    if(mode === 'year') {
        const year = Number(document.getElementById('admin-period-year').value);
        if(!Number.isInteger(year) || year < 2020 || year > 2100) {
            throw new Error("Sélectionnez une année valide.");
        }
        return {
            mode,
            year,
            start: new Date(Date.UTC(year, 0, 1)),
            end: new Date(Date.UTC(year + 1, 0, 1))
        };
    }

    const value = document.getElementById('admin-period-month').value;
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if(!match) throw new Error("Sélectionnez un mois valide.");
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    return {
        mode: 'month',
        year,
        month,
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 1))
    };
}

async function getAdminUsageEvents(start, end) {
    const startTimestamp = firebase.firestore.Timestamp.fromDate(start);
    const endTimestamp = firebase.firestore.Timestamp.fromDate(end);
    const events = [];
    let query = db.collection('usageEvents')
        .where('occurredAt', '>=', startTimestamp)
        .where('occurredAt', '<', endTimestamp)
        .orderBy('occurredAt')
        .limit(1000);
    while(true) {
        const snapshot = await query.get();
        events.push(...snapshot.docs.map(doc => doc.data()));
        if(snapshot.docs.length < 1000) break;
        query = query.startAfter(snapshot.docs[snapshot.docs.length - 1]);
    }
    return events;
}

function renderAdminMetrics(period, events, recentEvents) {
    const clubsById = new Map(allClubs.map(club => [club.id, {
        name: club.name || 'Club sans nom',
        activeAccounts: new Set(),
        sessionsCreated: 0,
        sessionsCompleted: 0
    }]));
    const activeAccounts = new Set();
    const recentActiveAccounts = new Set();
    const trends = new Map();
    const bucketCount = period.mode === 'year' ? 12 : new Date(Date.UTC(period.year, period.month + 1, 0)).getUTCDate();
    const bucketLabels = period.mode === 'year'
        ? Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(period.year, index, 1))
            .toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }))
        : Array.from({ length: bucketCount }, (_, index) => String(index + 1));
    for(let index = 0; index < bucketCount; index++) {
        trends.set(index, { activeAccounts: new Set(), sessionsCreated: 0, sessionsCompleted: 0 });
    }

    const getEventBucket = event => {
        if(!event.occurredAt || typeof event.occurredAt.toDate !== 'function') return null;
        const date = event.occurredAt.toDate();
        return period.mode === 'year' ? date.getUTCMonth() : date.getUTCDate() - 1;
    };
    events.forEach(event => {
        const bucket = getEventBucket(event);
        const trend = trends.get(bucket);
        if(event.type === 'login' && event.actorId) {
            activeAccounts.add(event.actorId);
            if(trend) trend.activeAccounts.add(event.actorId);
            (event.clubIds || []).forEach(clubId => {
                if(clubsById.has(clubId)) clubsById.get(clubId).activeAccounts.add(event.actorId);
            });
        } else if(event.type === 'session_created') {
            if(clubsById.has(event.clubId)) clubsById.get(event.clubId).sessionsCreated++;
            if(trend) trend.sessionsCreated++;
        } else if(event.type === 'assignment_completed') {
            if(clubsById.has(event.clubId)) clubsById.get(event.clubId).sessionsCompleted++;
            if(trend) trend.sessionsCompleted++;
        }
    });
    recentEvents.forEach(event => {
        if(event.type === 'login' && event.actorId) recentActiveAccounts.add(event.actorId);
    });

    document.getElementById('admin-metrics-cards').innerHTML = `
        <article class="admin-metric-card"><span>Comptes actifs sur la période</span><strong>${activeAccounts.size}</strong></article>
        <article class="admin-metric-card"><span>Séances créées sur la période</span><strong>${events.filter(event => event.type === 'session_created').length}</strong></article>
        <article class="admin-metric-card"><span>Séances réalisées sur la période</span><strong>${events.filter(event => event.type === 'assignment_completed').length}</strong></article>
        <article class="admin-metric-card"><span>Comptes actifs sur 14 jours</span><strong>${recentActiveAccounts.size}</strong></article>
    `;

    const rows = [...clubsById.entries()].sort((first, second) =>
        first[1].name.localeCompare(second[1].name, 'fr')
    );
    document.getElementById('admin-clubs-table-body').innerHTML = rows.map(([clubId, metrics]) => `
        <tr>
            <th scope="row">${escapeHtml(metrics.name)}</th>
            <td>${metrics.activeAccounts.size}</td>
            <td>${metrics.sessionsCreated}</td>
            <td>${metrics.sessionsCompleted}</td>
        </tr>
    `).join('') || '<tr><td colspan="4">Aucun club disponible.</td></tr>';

    document.getElementById('admin-chart-title').textContent = period.mode === 'year'
        ? `Évolution mensuelle — ${period.year}`
        : `Évolution quotidienne — ${period.year}-${String(period.month + 1).padStart(2, '0')}`;
    if(adminUsageChart) adminUsageChart.destroy();
    const canvas = document.getElementById('admin-usage-chart');
    if(typeof Chart === 'undefined') {
        return;
    }
    adminUsageChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: bucketLabels,
            datasets: [
                { label: 'Comptes actifs', data: [...trends.values()].map(item => item.activeAccounts.size), borderColor: '#0055A4', backgroundColor: 'rgba(0, 85, 164, 0.1)', tension: 0.25 },
                { label: 'Séances créées', data: [...trends.values()].map(item => item.sessionsCreated), borderColor: '#0284C7', backgroundColor: 'rgba(2, 132, 199, 0.1)', tension: 0.25 },
                { label: 'Séances réalisées', data: [...trends.values()].map(item => item.sessionsCompleted), borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.25 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

async function loadAdminMetrics() {
    if(!isPlatformAdmin()) return;
    const generation = ++adminMetricsGeneration;
    const status = document.getElementById('admin-metrics-status');
    const refreshButton = document.getElementById('admin-refresh');
    status.textContent = "Chargement des statistiques…";
    refreshButton.disabled = true;
    try {
        const period = getAdminPeriodRange();
        const recentStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const recentEnd = new Date();
        const [clubsSnapshot, events] = await Promise.all([
            db.collection('clubs').get(),
            getAdminUsageEvents(period.start, period.end)
        ]);
        const recentEvents = period.start <= recentStart && period.end >= recentEnd
            ? events.filter(event => event.occurredAt.toDate() >= recentStart)
            : await getAdminUsageEvents(recentStart, recentEnd);
        if(generation !== adminMetricsGeneration || !isPlatformAdmin()) return;
        allClubs = clubsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        renderAdminClubSelect();
        renderAdminMetrics(period, events, recentEvents);
        status.textContent = `${events.length} événements agrégés chargés. Historique suivi à partir du déploiement.` +
            (typeof Chart === 'undefined' ? " Le graphique est indisponible (bibliothèque non chargée)." : '');
    } catch(error) {
        if(generation !== adminMetricsGeneration) return;
        console.error("Erreur de chargement des statistiques administrateur:", error);
        status.textContent = `Impossible de charger les statistiques : ${error.message}`;
    } finally {
        if(generation === adminMetricsGeneration) refreshButton.disabled = false;
    }
}

function renderAdminClubSelect() {
    const select = document.getElementById('admin-club-select');
    if(!select) return;
    const previousValue = select.value;
    select.replaceChildren(new Option('Choisir un club', ''));
    [...allClubs].sort((first, second) => (first.name || '').localeCompare(second.name || '', 'fr'))
        .forEach(club => select.add(new Option(club.name || 'Club sans nom', club.id)));
    if(allClubs.some(club => club.id === previousValue)) select.value = previousValue;
}

function openAdminManagedClub() {
    if(!isPlatformAdmin() || !currentUser || adminManagedClubId) return;
    const clubId = document.getElementById('admin-club-select').value;
    if(!allClubs.some(club => club.id === clubId)) return alert('Sélectionnez un club valide.');
    adminReturnClubId = currentUser.clubId || null;
    adminManagedClubId = clubId;
    currentUser = { ...currentUser, clubId };
    startRealtimeListeners(clubId);
    showApp();
}

function leaveAdminManagedClub() {
    if(!adminManagedClubId || !currentUser) return;
    const returnClubId = adminReturnClubId;
    adminManagedClubId = null;
    adminReturnClubId = null;
    currentUser = { ...currentUser, clubId: returnClubId };
    startRealtimeListeners(returnClubId);
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
    let parentLinkFailed = false;

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

        const newUser = {
            id: user.uid,
            username,
            role,
            clubId,
            clubIds: [clubId],
            primaryClubId: clubId,
            clubRoles: { [clubId]: isCreatingClub ? 'gerant' : 'athlete' },
            avatar: null
        };
        
        const createBatch = db.batch();
        createBatch.set(db.collection('users').doc(newUser.id), newUser);
        createBatch.set(getPrivateProfileRef(newUser.id), { email, dob, profile: getEmptyProfile() });
        createBatch.set(getClubDirectoryRef(clubId, newUser.id), getDirectoryEntry(newUser, clubId));
        await createBatch.commit();
        if(age < 18) {
            currentUserParentCode = await ensureParentLinkCode(user.uid);
        }
        if(age >= 18) {
            const code = document.getElementById('reg-link-code').value.trim();
            if(code) {
                try {
                    await createParentChildLink(user.uid, code, clubId);
                } catch(error) {
                    console.error("Erreur de liaison du compte enfant pendant l'inscription:", error);
                    parentLinkFailed = true;
                }
            }
        }
        
        await user.sendEmailVerification();
        await auth.signOut();
        isRegistering = false; 
        
        document.getElementById('loader-screen').style.display = 'none';
        alert(parentLinkFailed
            ? "Compte créé et email de vérification envoyé. La liaison du compte enfant a échoué ; vous pourrez réessayer depuis votre profil après connexion."
            : "Compte créé avec succès ! Un email de vérification vous a été envoyé. Veuillez cliquer sur le lien avant de vous connecter.");
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
    if(auth.currentUser) {
        await startAuthenticatedSession(auth.currentUser);
        return;
    }

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return alert("Veuillez remplir tous les champs.");

    document.getElementById('loader-screen').style.display = 'flex';
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        document.getElementById('loader-screen').style.display = 'none';
        const message = error.code === 'auth/network-request-failed'
            ? "Connexion Firebase impossible. Vérifiez votre accès internet, puis réessayez."
            : error.code === 'auth/too-many-requests'
                ? "Trop de tentatives. Patientez avant de réessayer."
                : "Email ou mot de passe incorrect.";
        alert(message);
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
        adminManagedClubId = null;
        adminReturnClubId = null;
        originalParentUser = null;
        linkedChildIds = [];
        linkedParentIds = [];
        currentUserParentCode = null;
        initAuthUI();
    } catch(error) {
        console.error("Erreur de déconnexion:", error);
        if(currentUser && currentUser.clubId) startRealtimeListeners(currentUser.clubId);
        alert("Impossible de vous déconnecter : " + error.message);
    }
}

// === COMPTES LIES ===
function toggleAccountMenu() {
    const dd = document.getElementById('account-dropdown');
    if(linkedChildIds.length === 0 && !originalParentUser) return;
    if(dd.style.display === 'block') { dd.style.display = 'none'; return; }
    let html = '';
    if(originalParentUser) html += `<button onclick="switchAccount('${escapeHtml(originalParentUser.id)}')">↩ Retour Parent (${escapeHtml(originalParentUser.username)})</button>`;
    linkedChildIds.forEach(cId => {
        const c = clubMembers.find(u=>u.id===cId);
        if(c && c.id !== currentUser.id) html += `<button onclick="switchAccount('${escapeHtml(c.id)}')">👶 Basculer vers ${escapeHtml(c.username)}</button>`;
    });
    dd.innerHTML = html; dd.style.display = 'block';
}
async function switchAccount(targetId) {
    if(adminManagedClubId) leaveAdminManagedClub();
    const parentUser = originalParentUser || currentUser;
    if(targetId === parentUser.id) {
        if(!originalParentUser) return;
        currentUser = originalParentUser;
        originalParentUser = null;
        currentUserParentCode = parentLinkCodeCache.get(currentUser.id) || null;
    } else {
        if(!linkedChildIds.includes(targetId)) return alert("Ce compte n'est pas lié de manière vérifiée à votre compte.");
        const target = clubMembers.find(user => user.id === targetId);
        if(!target) return alert("Le compte enfant n'est pas disponible dans ce club.");
        const sharedClubId = getUserClubIds(parentUser).find(id => getUserClubIds(target).includes(id));
        if(!sharedClubId) return alert("Vous et cet enfant devez avoir au moins un club en commun.");
        originalParentUser = parentUser;
        currentUser = { ...target, clubId: getUserClubIds(parentUser).includes(parentUser.clubId) &&
            getUserClubIds(target).includes(parentUser.clubId) ? parentUser.clubId : sharedClubId };
        try {
            const privateData = await loadPrivateProfile(targetId);
            if(!privateData) throw new Error("Le profil privé de l'enfant n'est pas encore migré.");
            currentUser.email = privateData.email;
            currentUser.dob = privateData.dob;
            currentUser.profile = privateData.profile;
        } catch(error) {
            originalParentUser = null;
            currentUser = parentUser;
            console.error("Erreur de chargement du profil privé de l'enfant:", error);
            return alert("Impossible d'ouvrir le compte enfant : " + error.message);
        }
        currentUserParentCode = null;
    }
    document.getElementById('account-dropdown').style.display = 'none';
    startRealtimeListeners(currentUser.clubId || null);
    showApp();
}
function openLinkChildModal() { document.getElementById('input-link-child').value = ''; openModal('modal-link-child'); }
async function linkChildAccount() {
    const code = document.getElementById('input-link-child').value.trim().toUpperCase();
    if(originalParentUser || !auth.currentUser || auth.currentUser.uid !== currentUser.id) {
        return alert("Revenez au compte parent pour lier un enfant.");
    }
    if(!isValidParentLinkCode(code)) return alert("Saisissez le code privé de 10 caractères communiqué par l'enfant.");
    try {
        const childId = await createParentChildLink(currentUser.id, code, currentUser.clubId);
        if(!linkedChildIds.includes(childId)) linkedChildIds.push(childId);
        alert("Compte lié !");
        closeModal('modal-link-child');
        showApp();
    } catch(error) {
        console.error("Erreur de liaison du compte enfant:", error);
        const rulesHint = error.code === 'permission-denied'
            ? " Les règles Firestore doivent être publiées à jour pour activer la liaison parent-enfant."
            : "";
        alert("Impossible de lier le compte : " + error.message + rulesHint);
    }
}

// === NAVIGATION ===
function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
    const adminNav = document.getElementById('nav-platform-admin');
    const chatButton = document.querySelector('.chat-btn-float');
    adminNav.style.display = isPlatformAdmin() ? 'inline-block' : 'none';
    if(chatButton) chatButton.style.display = '';
    document.querySelectorAll('#main-nav button:not(#btn-logout)').forEach(button => button.style.display = '');
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
    if(btnLink) btnLink.style.display = age >= 18 && !originalParentUser ? 'inline-block' : 'none';
}
function switchTab(tab) {
    if(tab === 'platform-admin' && !isPlatformAdmin()) return;
    if(adminManagedClubId && !['coach-dashboard', 'coach-athletes'].includes(tab)) {
        leaveAdminManagedClub();
    }
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(tab + '-space');
    if(!target) return;
    target.classList.add('active');
    const navBtn = document.getElementById('nav-' + tab); if(navBtn) navBtn.classList.add('active');
    if(tab === 'platform-admin') {
        const now = new Date();
        if(!document.getElementById('admin-period-month').value) {
            document.getElementById('admin-period-month').value =
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        if(!document.getElementById('admin-period-year').value) {
            document.getElementById('admin-period-year').value = String(now.getFullYear());
        }
        document.getElementById('admin-period-mode').value = 'month';
        document.getElementById('admin-period-month').style.display = '';
        document.getElementById('admin-period-year').style.display = 'none';
        loadAdminMetrics();
        return;
    }
    refreshCurrentTab();
}
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// === NOTIFICATIONS ===
async function pushNotification(text) {
    const notif = {
        id: 'notif_' + Date.now(),
        clubId: currentUser.clubId,
        createdBy: currentUser.id,
        text,
        date: new Date().toLocaleDateString('fr-FR', { hour: '2-digit', minute:'2-digit' }),
        timestamp: Date.now()
    };
    try {
        await db.collection('notifications').doc(notif.id).set(notif);
    } catch(error) {
        console.error("Erreur d'enregistrement de la notification:", error);
        alert("Impossible d'enregistrer la notification : " + error.message);
    }
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
    if(!c) return alert("Saisissez un nom de catégorie.");
    if(club.categories.includes(c)) return alert("Cette catégorie existe déjà.");

    const categories = [...club.categories, c];
    try {
        await db.collection('clubs').doc(club.id).update({ categories });
        club.categories = categories;
        updateCategorySelect();
        document.getElementById('block-category').value = c;
        closeModal('modal-new-category');
    } catch(error) {
        console.error("Erreur d'enregistrement de la catégorie:", error);
        alert("Impossible d'ajouter la catégorie : " + error.message);
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
    document.getElementById('builder-blocks-list').innerHTML = filtered.map(b => {
        const firstLines = String(b.description || '').split(/\r?\n/).slice(0, 2).join('\n');
        return `<div class="builder-block-card">
            <button type="button" class="builder-block-preview-button" onclick="openBlockPreview('${escapeHtml(b.id)}')">
                <span class="builder-block-category">${escapeHtml(b.category)}</span>
                <strong>${escapeHtml(b.title)}</strong>
                <span class="builder-block-description-preview">${escapeHtml(firstLines) || 'Aucune consigne renseignée.'}</span>
            </button>
            <button type="button" class="btn-outline builder-block-add-button" aria-label="Ajouter ${escapeHtml(b.title)} à la séance" onclick="addBlockToBuilder('${escapeHtml(b.id)}')">+</button>
        </div>`;
    }).join('') || "<p style='color:var(--text-muted); font-size:0.85rem; padding:1rem;'>Aucun bloc personnel disponible.</p>";
}
function openBlockPreview(blockId) {
    const block = getMyBlocks().find(item => item.id === blockId);
    if(!block) {
        alert("Ce bloc n'est plus disponible. Actualisez la liste et réessayez.");
        updateBuilderBlocksList();
        return;
    }
    viewedBlockId = block.id;
    document.getElementById('block-preview-category').textContent = block.category || 'Exercice';
    document.getElementById('block-preview-title').textContent = block.title || 'Exercice sans titre';
    document.getElementById('block-preview-description').textContent = block.description || 'Aucune consigne renseignée.';
    openModal('modal-block-preview');
}
function addPreviewedBlockToBuilder() {
    if(!viewedBlockId) return;
    addBlockToBuilder(viewedBlockId);
    closeModal('modal-block-preview');
    viewedBlockId = null;
}
function addBlockToBuilder(blockId) {
    const block = getMyBlocks().find(item => item.id === blockId);
    if(!block) {
        alert("Ce bloc n'est plus disponible. Actualisez la liste et réessayez.");
        updateBuilderBlocksList();
        return;
    }
    builderBlocks.push(block.id);
    updateBuilderSeq();
}
function moveBuilderBlock(fromIndex, toIndex) {
    if(fromIndex < 0 || fromIndex >= builderBlocks.length || toIndex < 0 || toIndex > builderBlocks.length) return;
    const [blockId] = builderBlocks.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    builderBlocks.splice(insertIndex, 0, blockId);
    updateBuilderSeq();
}
function updateBuilderSeq() {
    const sequence = document.getElementById('session-sequence');
    if(!sequence) return;
    sequence.replaceChildren();
    if(builderBlocks.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.style.color = 'var(--text-muted)';
        emptyMessage.textContent = 'Ajoutez des blocs depuis la liste des ressources.';
        sequence.appendChild(emptyMessage);
        return;
    }

    builderBlocks.forEach((blockReference, index) => {
        const blockId = typeof blockReference === 'string' ? blockReference : blockReference && blockReference.id;
        const block = clubBlocks.find(item => item.id === blockId);
        const item = document.createElement('div');
        item.className = 'draggable-item';
        item.draggable = true;
        item.addEventListener('dragstart', event => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
        });
        item.addEventListener('dragover', event => event.preventDefault());
        item.addEventListener('drop', event => {
            event.preventDefault();
            const fromIndex = Number(event.dataTransfer.getData('text/plain'));
            if(!Number.isInteger(fromIndex)) return;
            const dropAfter = event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
            moveBuilderBlock(fromIndex, index + (dropAfter ? 1 : 0));
        });

        const details = document.createElement('div');
        const category = document.createElement('div');
        category.className = 'card-category';
        category.textContent = block ? block.category || '' : 'Bloc indisponible';
        const title = document.createElement('div');
        title.textContent = block ? block.title || '' : `Bloc introuvable (${blockId || 'sans identifiant'})`;
        details.append(category, title);

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '0.25rem';
        const upButton = document.createElement('button');
        upButton.type = 'button';
        upButton.className = 'btn-icon';
        upButton.textContent = '↑';
        upButton.setAttribute('aria-label', `Déplacer ${block ? block.title : 'le bloc'} vers le haut`);
        upButton.disabled = index === 0;
        upButton.addEventListener('click', () => moveBuilderBlock(index, index - 1));
        const downButton = document.createElement('button');
        downButton.type = 'button';
        downButton.className = 'btn-icon';
        downButton.textContent = '↓';
        downButton.setAttribute('aria-label', `Déplacer ${block ? block.title : 'le bloc'} vers le bas`);
        downButton.disabled = index === builderBlocks.length - 1;
        downButton.addEventListener('click', () => moveBuilderBlock(index, index + 2));
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn-icon';
        removeButton.textContent = '×';
        removeButton.setAttribute('aria-label', `Retirer ${block ? block.title : 'le bloc'} de la séance`);
        removeButton.addEventListener('click', () => {
            builderBlocks.splice(index, 1);
            updateBuilderSeq();
        });
        controls.append(upButton, downButton, removeButton);
        item.append(details, controls);
        sequence.appendChild(item);
    });
}
async function saveSession() {
    const name = document.getElementById('session-name').value.trim();
    if(!name) return alert("Veuillez donner un nom à la séance.");
    if(builderBlocks.length === 0) return alert("Ajoutez au moins un bloc à la séance.");
    if(isSavingSession) return;

    const saveButton = document.getElementById('save-session-button');
    isSavingSession = true;
    if(saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Enregistrement…";
    }
    try {
        const sessionData = { name, blocks: [...builderBlocks], clubId: currentUser.clubId };
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
            sessionData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const batch = db.batch();
            batch.set(db.collection('sessions').doc(sessionData.id), sessionData);
            addSessionCreationUsageEvent(batch, sessionData);
            await batch.commit();
        }
        closeModal('modal-create-session');
        setSessionLibraryTab('personal');
    } catch(error) {
        console.error("Erreur d'enregistrement de la séance:", error);
        alert("Impossible d'enregistrer la séance : " + error.message);
    } finally {
        isSavingSession = false;
        if(saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "Enregistrer la séance";
        }
    }
}

function createUnavailableBlockSnapshot(blockId, index) {
    return {
        id: blockId || `block-${index}`,
        category: 'Indisponible',
        title: 'Exercice indisponible',
        description: "Cet exercice a été supprimé ou n'est plus disponible dans le club."
    };
}

async function createAssignedSessionSnapshot(session) {
    const blocks = await Promise.all((session.blocks || []).map(async (blockId, index) => {
        let block = clubBlocks.find(item => item.id === blockId);
        if(!block) {
            const blockSnap = await db.collection('blocks').doc(blockId).get();
            if(blockSnap.exists) block = { id: blockSnap.id, ...blockSnap.data() };
        }
        if(!block) return createUnavailableBlockSnapshot(blockId, index);
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
        if(!block && blockId && !hasCoachRights(currentUser, session.clubId)) {
            throw new Error("Cette ancienne séance ne contient pas encore le détail de ses exercices. Demandez au coach de la modifier et de l'enregistrer.");
        }
        if(!block && blockId) {
            const blockSnap = await db.collection('blocks').doc(blockId).get();
            if(blockSnap.exists) block = { id: blockSnap.id, ...blockSnap.data() };
        }
        if(!block) return createUnavailableBlockSnapshot(blockId, index);
        return {
            id: block.id || blockId || `block-${index}`,
            category: block.category || '',
            title: block.title || '',
            description: block.description || ''
        };
    }));
}

async function duplicateSession(id) {
    const s = clubSessions.find(x => x.id === id);
    if(!s) return alert("Cette séance n'est plus disponible.");
    const newSession = {
        id: 'sess_' + Date.now(),
        name: s.name + " (Copie)",
        blocks: [...(s.blocks || [])],
        clubId: currentUser.clubId,
        authorId: currentUser.id,
        isShared: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        const batch = db.batch();
        batch.set(db.collection('sessions').doc(newSession.id), newSession);
        addSessionCreationUsageEvent(batch, newSession);
        await batch.commit();
        setSessionLibraryTab('personal');
    } catch(error) {
        console.error("Erreur de duplication de la séance:", error);
        alert("Impossible de dupliquer la séance : " + error.message);
    }
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
    builderBlocks = (s.blocks || []).map(block => typeof block === 'string' ? block : block && block.id).filter(Boolean); currentSessionFilter = 'Toutes';
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
            isShared: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const batch = db.batch();
        batch.set(db.collection('sessions').doc(sharedSession.id), sharedSession);
        addSessionCreationUsageEvent(batch, sharedSession);
        await batch.commit();
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
    const pendingAthleteIds = new Set(pendingExist.map(assignment => assignment.athleteId));
    assignmentPendingAthleteIds = pendingAthleteIds;
    assignmentSelectedIds = new Set();
    
    const grpContainer = document.getElementById('assign-groups-container');
    grpContainer.innerHTML = '';
    const groups = (currentUser.profile.groups || []).filter(g => !g.clubId || g.clubId === currentUser.clubId);
    if(groups.length > 0) {
        let html = `<h3 class="assignment-section-title">Attribuer à un groupe</h3>`;
        groups.forEach(g => {
            html += `
            <section class="assignment-group-card">
                <div class="assignment-group-heading">
                    <strong>${escapeHtml(g.name)}</strong>
                    <button type="button" class="btn-outline" onclick="checkGroupAthletes('${escapeHtml(g.id)}')">Tout sélectionner</button>
                </div>
                <div class="group-member-picker assignment-group-members" data-group-id="${escapeHtml(g.id)}">
                    ${(g.athletes || []).map(aId => renderAssignmentMemberOption(clubMembers.find(member => member.id === aId), pendingAthleteIds)).filter(Boolean).join('') || '<p class="group-member-empty">Aucun membre de ce groupe dans le club.</p>'}
                </div>
            </section>`;
        });
        grpContainer.innerHTML = html;
    }

    document.getElementById('assignment-member-search').value = '';
    document.getElementById('athlete-checklist').innerHTML = '';
    renderAssignmentMemberPicker(pendingAthleteIds);
    renderAssignmentSelection();
    openModal('modal-assign-session');
}

function renderAssignmentMemberOption(member, pendingAthleteIds) {
    if(!member) return '';
    const isPending = pendingAthleteIds.has(member.id);
    const avatar = member.avatar
        ? `<img src="${escapeHtml(member.avatar)}" alt="" class="group-member-avatar">`
        : '<span class="group-member-avatar group-member-avatar-placeholder" aria-hidden="true">👤</span>';
    return `<label class="group-member-option assignment-member-option ${assignmentSelectedIds.has(member.id) ? 'selected' : ''} ${isPending ? 'assignment-member-pending' : ''}" data-member-name="${escapeHtml(member.username || '')}">
        <input type="checkbox" class="athlete-checkbox" value="${escapeHtml(member.id)}" ${assignmentSelectedIds.has(member.id) || isPending ? 'checked' : ''} ${isPending ? 'disabled' : ''} onchange="updateAssignmentSelection(this)">
        ${avatar}
        <span class="group-member-details"><strong>${escapeHtml(member.username || 'Membre')}</strong><small>${escapeHtml(getRoleLabel(getClubRole(member, currentUser.clubId)))}</small></span>
        <span class="group-member-checkmark" aria-hidden="true">✓</span>
    </label>`;
}

function renderAssignmentMemberPicker(pendingAthleteIds = assignmentPendingAthleteIds) {
    const container = document.getElementById('athlete-checklist');
    const search = document.getElementById('assignment-member-search');
    if(!container || !search) return;
    const query = search.value.trim().toLocaleLowerCase('fr-FR');
    const visibleMembers = clubMembers.filter(member =>
        String(member.username || '').toLocaleLowerCase('fr-FR').includes(query)
    );
    container.innerHTML = visibleMembers.map(member => renderAssignmentMemberOption(member, pendingAthleteIds)).join('') ||
        '<p class="group-member-empty">Aucun membre ne correspond à cette recherche.</p>';
}

function renderAssignmentSelection() {
    document.querySelectorAll('#modal-assign-session .athlete-checkbox').forEach(checkbox => {
        if(checkbox.disabled) return;
        checkbox.checked = assignmentSelectedIds.has(checkbox.value);
        checkbox.closest('.assignment-member-option').classList.toggle('selected', checkbox.checked);
    });
    const count = document.getElementById('assignment-member-count');
    if(count) {
        const selectedCount = assignmentSelectedIds.size;
        count.textContent = `${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}`;
    }
}

function updateAssignmentSelection(checkbox) {
    if(checkbox.checked) assignmentSelectedIds.add(checkbox.value);
    else assignmentSelectedIds.delete(checkbox.value);
    renderAssignmentSelection();
}

function checkGroupAthletes(gId) {
    const groupPicker = [...document.querySelectorAll('.assignment-group-members')]
        .find(container => container.dataset.groupId === gId);
    if(!groupPicker) return;
    groupPicker.querySelectorAll('.athlete-checkbox:not(:disabled)').forEach(checkbox => assignmentSelectedIds.add(checkbox.value));
    renderAssignmentSelection();
}

function selectAllAthletes() {
    document.querySelectorAll('#athlete-checklist .athlete-checkbox:not(:disabled)').forEach(checkbox => assignmentSelectedIds.add(checkbox.value));
    renderAssignmentSelection();
}

async function saveAssignments() { 
    const selectedIds = assignmentSelectedIds;
    if(selectedIds.size === 0) return alert("Sélectionnez au moins un membre.");
    const session = clubSessions.find(item => item.id === sessionToAssignId);
    if(!session) return alert("Cette séance n'est plus disponible dans la banque.");

    try {
        const sessionSnapshot = await createAssignedSessionSnapshot(session);
        const batch = db.batch();
        batch.update(db.collection('sessions').doc(sessionToAssignId), {
            assignedAthleteIds: firebase.firestore.FieldValue.arrayUnion(...selectedIds)
        });
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
        const avatar = member.avatar
            ? `<img src="${escapeHtml(member.avatar)}" alt="" class="group-member-avatar">`
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
    const groups = (currentUser.profile.groups || []).filter(group => group.id !== gId);
    try {
        await savePrivateProfile(currentUser.id, { 'profile.groups': groups });
        currentUser.profile.groups = groups;
        if(editingGroupId === gId) resetGroupEditor();
        renderManageGroupsList();
        renderCoachAthletes();
    } catch(error) {
        console.error("Erreur de suppression du groupe:", error);
        alert("Impossible de supprimer le groupe : " + error.message);
    }
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
        await savePrivateProfile(currentUser.id, { 'profile.groups': groups });
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
        await savePrivateProfile(currentUser.id, { 'profile.groups': groups });
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
        if(ath.avatar) avatarHtml = `<img src="${escapeHtml(ath.avatar)}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; margin-bottom:0.5rem;">`;
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
        const avatar = member.avatar
            ? `<img src="${escapeHtml(member.avatar)}" alt="" class="athlete-club-member-avatar">`
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
        const remainingAssignments = clubAssignments.some(item =>
            item.id !== assId &&
            item.sessionId === assignment.sessionId &&
            item.athleteId === assignment.athleteId
        );
        const batch = db.batch();
        batch.delete(db.collection('assignments').doc(assId));
        const revokeSessionAccess = !remainingAssignments && (hasCoachRights() || assignment.sessionSnapshot);
        if(revokeSessionAccess) {
            const sessionRef = db.collection('sessions').doc(assignment.sessionId);
            batch.update(sessionRef, {
                assignedAthleteIds: firebase.firestore.FieldValue.arrayRemove(assignment.athleteId)
            });
        }
        try {
            await batch.commit();
        } catch(error) {
            if(!revokeSessionAccess || !['permission-denied', 'not-found'].includes(error.code)) throw error;
            console.warn("L'accès à la séance n'a pas pu être retiré ; suppression de l'attribution seule.", error);
            await db.collection('assignments').doc(assId).delete();
        }
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

    try {
        const batch = db.batch();
        batch.update(db.collection('assignments').doc(a.id), {
            isDone: true,
            doneAt: Date.now(),
            annotation: annotation,
            plaisir: plaisir,
            difficulte: difficulte,
            fatigue: fatigue,
            blockRpes: blockRpes,
            avgRpe: avgRpe
        });
        if(!a.isDone) {
            batch.set(db.collection('usageEvents').doc(), {
                type: 'assignment_completed',
                actorId: currentUser.id,
                clubId: a.clubId,
                sourceId: a.id,
                occurredAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        await batch.commit();

        closeModal('modal-view-session');
        refreshCurrentTab();
        alert("Séance enregistrée avec succès !");
    } catch(error) {
        console.error("Erreur d'enregistrement du bilan de séance:", error);
        alert("Impossible d'enregistrer le bilan de séance : " + error.message);
    }
};

// --- ATHLETE PROFIL & AVATAR ---
function renderAthleteProfile() {
    document.getElementById('profile-display-name').textContent = currentUser.username;
    document.getElementById('profile-objectives').value = currentUser.profile.objectives || '';
    const adminEntry = document.getElementById('profile-admin-entry');
    if(adminEntry) {
        adminEntry.style.display = isPlatformAdmin() && !originalParentUser &&
            auth.currentUser && auth.currentUser.uid === currentUser.id ? 'inline-block' : 'none';
    }
    
    const pre = document.getElementById('profile-avatar-preview');
    const pla = document.getElementById('profile-avatar-placeholder');
    const avatar = currentUser.avatar || currentUser.profile.avatar;
    if (avatar) {
        pre.src = avatar; pre.style.display = 'block'; pla.style.display = 'none';
    } else { pre.style.display = 'none'; pla.style.display = 'block'; }

    const pCode = document.getElementById('profile-parent-code-display');
    const isOwnAccount = !originalParentUser && auth.currentUser && auth.currentUser.uid === currentUser.id;
    const age = currentUser.dob
        ? (new Date() - new Date(currentUser.dob)) / (1000*60*60*24*365.25)
        : 18;
    if(isOwnAccount && (age < 18 || currentUserParentCode)) {
        pCode.innerHTML = currentUserParentCode
            ? `<div class="parent-code-badge">Code parent (10 caractères) : <code>${escapeHtml(currentUserParentCode)}</code></div><button class="btn-outline" style="margin-top:0.4rem;" onclick="copyParentLinkCode()">Copier le code</button><small class="form-hint">Code à usage unique. Après son utilisation, reconnectez-vous pour en générer un nouveau.</small>`
            : '<button class="btn-outline" onclick="generateParentLinkCode()">Créer mon code parent</button>';
        pCode.style.display = 'block';
    } else {
        pCode.style.display = 'none';
    }
    
    const childrenList = document.getElementById('profile-linked-children-list');
    const linkedChildrenMarkup = !originalParentUser && linkedChildIds.length > 0
        ? "Enfants liés : " + linkedChildIds.map(childId => {
            const child = clubMembers.find(user => user.id === childId);
            return `<span style="background:var(--bg-color); padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(child ? child.username : 'Enfant')} <button class="btn-icon" title="Délier ce compte" aria-label="Délier ce compte" onclick="unlinkChildAccount('${escapeHtml(childId)}')">×</button></span>`;
        }).join('')
        : '';
    const linkedParentsMarkup = isOwnAccount && linkedParentIds.length > 0
        ? "Parents liés : " + linkedParentIds.map(parentId => {
            const parent = clubMembers.find(user => user.id === parentId);
            return `<span style="background:var(--bg-color); padding:2px 6px; border-radius:4px; font-weight:600;">${escapeHtml(parent ? parent.username : 'Parent')} <button class="btn-icon" title="Délier ce compte parent" aria-label="Délier ce compte parent" onclick="unlinkParentAccount('${escapeHtml(parentId)}')">×</button></span>`;
        }).join('')
        : '';
    const hasUnverifiedLegacyLinks = !originalParentUser &&
        Array.isArray(currentUser.linkedChildren) &&
        currentUser.linkedChildren.some(childId => !linkedChildIds.includes(childId));
    const revalidationNotice = hasUnverifiedLegacyLinks
        ? '<p class="form-hint">Pour protéger les comptes, les anciennes liaisons doivent être renouvelées : demandez à chaque enfant de se connecter et de vous transmettre son nouveau code privé.</p>'
        : '';
    childrenList.innerHTML = linkedChildrenMarkup + linkedParentsMarkup + revalidationNotice;

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

async function generateParentLinkCode() {
    if(originalParentUser || !auth.currentUser || auth.currentUser.uid !== currentUser.id) {
        return alert("Seul le titulaire du compte enfant peut créer son code privé.");
    }
    try {
        currentUserParentCode = await ensureParentLinkCode(currentUser.id, currentUser.parentCode);
        renderAthleteProfile();
    } catch(error) {
        console.error("Erreur de création du code parent:", error);
        const rulesHint = error.code === 'permission-denied'
            ? " Les nouvelles règles Firestore doivent être publiées avant de générer un code."
            : "";
        alert("Impossible de créer le code parent : " + error.message + rulesHint);
    }
}

async function copyParentLinkCode() {
    if(!currentUserParentCode) return;
    try {
        await navigator.clipboard.writeText(currentUserParentCode);
        alert("Code de 10 caractères copié. Transmettez-le uniquement au parent concerné.");
    } catch(error) {
        console.error("Erreur de copie du code parent:", error);
        alert("Copie impossible. Sélectionnez et copiez le code affiché.");
    }
}

async function unlinkChildAccount(childId) {
    if(originalParentUser || !auth.currentUser || auth.currentUser.uid !== currentUser.id ||
        !linkedChildIds.includes(childId)) {
        return alert("Cette liaison ne peut pas être retirée depuis le compte actuel.");
    }
    if(!await showAppConfirm("Retirer l'accès parent à ce compte enfant ?")) return;
    try {
        await removeParentChildLink(currentUser.id, childId);
        linkedChildIds = linkedChildIds.filter(id => id !== childId);
        renderAthleteProfile();
    } catch(error) {
        console.error("Erreur de suppression de la liaison parent-enfant:", error);
        alert("Impossible de délier ce compte : " + error.message);
    }
}

async function unlinkParentAccount(parentId) {
    if(originalParentUser || !auth.currentUser || auth.currentUser.uid !== currentUser.id ||
        !linkedParentIds.includes(parentId)) {
        return alert("Cette liaison ne peut pas être retirée depuis le compte actuel.");
    }
    if(!await showAppConfirm("Retirer l'accès de ce parent à votre compte ?")) return;
    try {
        await removeParentChildLink(parentId, currentUser.id);
        linkedParentIds = linkedParentIds.filter(id => id !== parentId);
        renderAthleteProfile();
    } catch(error) {
        console.error("Erreur de suppression de la liaison parent-enfant:", error);
        alert("Impossible de délier ce parent : " + error.message);
    }
}

async function saveProfileObjectives() {
    const objectives = document.getElementById('profile-objectives').value.trim();
    try {
        await savePrivateProfile(currentUser.id, { 'profile.objectives': objectives });
        currentUser.profile.objectives = objectives;
        alert("Objectifs sauvegardés.");
    } catch(error) {
        console.error("Erreur d'enregistrement des objectifs:", error);
        alert("Impossible d'enregistrer les objectifs : " + error.message);
    }
}
        
async function handleAvatarUpload(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = '';
    if(!file) return;
    if(!file.type.startsWith('image/')) return alert("Sélectionnez un fichier image.");
    if(file.size > 5 * 1024 * 1024) return alert("La photo ne peut pas dépasser 5 Mo.");

    try {
        const avatar = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Impossible de lire l'image."));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error("Le fichier sélectionné n'est pas une image valide."));
                image.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = 250;
                    canvas.width = size;
                    canvas.height = size;
                    const context = canvas.getContext('2d');
                    if(!context) {
                        reject(new Error("Impossible de traiter cette image."));
                        return;
                    }
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
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
        const batch = db.batch();
        batch.update(db.collection('users').doc(currentUser.id), { avatar });
        batch.update(getPrivateProfileRef(currentUser.id), { 'profile.avatar': avatar });
        getUserClubIds(currentUser).forEach(clubId => {
            batch.set(getClubDirectoryRef(clubId, currentUser.id), {
                ...getDirectoryEntry({ ...currentUser, avatar }, clubId),
                avatar
            });
        });
        await batch.commit();
        currentUser.avatar = avatar;
        currentUser.profile.avatar = avatar;
        renderAthleteProfile();
    } catch(error) {
        console.error("Erreur de mise à jour de la photo de profil:", error);
        alert("Impossible de modifier la photo de profil : " + error.message);
    }
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
    
    const competitions = [...(currentUser.profile.competitions || [])];
    if(editingCompIndex !== null && competitions[editingCompIndex]) {
        competitions[editingCompIndex] = { ...competitions[editingCompIndex], type, place, feeling };
    } else {
        competitions.push({ type, place, feeling, date: Date.now() });
    }

    try {
        await savePrivateProfile(currentUser.id, { 'profile.competitions': competitions });
        currentUser.profile.competitions = competitions;
        closeModal('modal-competition');
        renderAthleteProfile();
    } catch(error) {
        console.error("Erreur d'enregistrement de la compétition:", error);
        alert("Impossible d'enregistrer la compétition : " + error.message);
    }
}

async function deleteCompetition(idx) {
    if(!await showAppConfirm("Êtes-vous sûr de vouloir supprimer cette compétition ?")) return;
    const competitions = [...(currentUser.profile.competitions || [])];
    if(idx < 0 || idx >= competitions.length) return alert("Cette compétition n'est plus disponible.");
    competitions.splice(idx, 1);
    try {
        await savePrivateProfile(currentUser.id, { 'profile.competitions': competitions });
        currentUser.profile.competitions = competitions;
        renderAthleteProfile();
    } catch(error) {
        console.error("Erreur de suppression de la compétition:", error);
        alert("Impossible de supprimer la compétition : " + error.message);
    }
}

// SKILLS
function openSkillsModal() {
    const buildRange = (themes, obj, containerId) => { document.getElementById(containerId).innerHTML = themes.map(t => `<div style="display:flex; flex-direction:column;"><label style="font-size:0.85rem; font-weight:600;">${t} (<b>${obj[t]||0}</b>)</label><input type="range" class="rpe-slider" min="0" max="10" value="${obj[t]||0}" oninput="this.previousElementSibling.querySelector('b').textContent = this.value" data-theme="${t}"></div>`).join(''); };
    buildRange(themes1, currentUser.profile.skillsT1, 'skills-form-t1'); buildRange(themes2, currentUser.profile.skillsT2, 'skills-form-t2'); openModal('modal-skills');
}
async function saveSkills() {
    const skillsT1 = { ...currentUser.profile.skillsT1 };
    const skillsT2 = { ...currentUser.profile.skillsT2 };
    document.querySelectorAll('#skills-form-t1 input').forEach(input => skillsT1[input.dataset.theme] = parseInt(input.value));
    document.querySelectorAll('#skills-form-t2 input').forEach(input => skillsT2[input.dataset.theme] = parseInt(input.value));
    try {
        await savePrivateProfile(currentUser.id, { 'profile.skillsT1': skillsT1, 'profile.skillsT2': skillsT2 });
        currentUser.profile.skillsT1 = skillsT1;
        currentUser.profile.skillsT2 = skillsT2;
        closeModal('modal-skills');
    } catch(error) {
        console.error("Erreur d'enregistrement des compétences:", error);
        alert("Impossible d'enregistrer les compétences : " + error.message);
    }
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
    const cal = (targetUser.profile && targetUser.profile.calendar) || {};
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
    const data = (targetUser.profile && targetUser.profile.calendar && targetUser.profile.calendar[dateStr]) || {};
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
    if(!u) return alert("Le membre concerné n'est plus disponible.");
    const isAct = document.getElementById('cal-note-status').value==="true"; const note = document.getElementById('cal-note-text').value.trim(); const assignId = document.getElementById('cal-note-session').value;
    const calendar = { ...((u.profile && u.profile.calendar) || {}) };
    if(!isAct && !note && !assignId) delete calendar[selectedDateForNote];
    else calendar[selectedDateForNote] = { active: isAct, note, assignmentId: assignId || null };

    try {
        await savePrivateProfile(u.id, { 'profile.calendar': calendar });
        u.profile.calendar = calendar;
        if(currentUser.id === u.id) currentUser.profile.calendar = calendar;
        closeModal('modal-calendar-note');
        refreshCurrentTab();
    } catch(error) {
        console.error("Erreur d'enregistrement de la note du calendrier:", error);
        alert("Impossible d'enregistrer cette note : " + error.message);
    }
}

// TIMER
let timerInterval = null; let timeRemaining = 0; let isWorkPhase = true; let currentRound = 1;
function updateTimerDisplay() {
    const m = Math.floor(timeRemaining/60).toString().padStart(2,'0');
    const s = (timeRemaining%60).toString().padStart(2,'0');
    document.getElementById('timer-display').textContent = `${m}:${s}`;
    const timer = document.getElementById('chrono-container');
    const phaseLabel = document.getElementById('timer-phase');
    if(timer) timer.dataset.phase = isWorkPhase ? 'work' : 'rest';
    if(phaseLabel) phaseLabel.textContent = isWorkPhase ? 'Travail' : 'Repos';
}
function startTimer() {
    if(timerInterval) return; 
    const w = parseInt(document.getElementById('timer-work').value)||10; const r = parseInt(document.getElementById('timer-rest').value)||20; const totalRounds = parseInt(document.getElementById('timer-rounds').value)||5;
    if(timeRemaining === 0) { timeRemaining = w; isWorkPhase = true; currentRound = 1; }
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        if(timeRemaining < 0) { if(isWorkPhase) { isWorkPhase = false; timeRemaining = r; } else { isWorkPhase = true; timeRemaining = w; currentRound++; if(currentRound > totalRounds) { resetTimer(); return alert("Terminé !"); } } }
        updateTimerDisplay();
    }, 1000);
}
function pauseTimer() { clearInterval(timerInterval); timerInterval = null; }
function resetTimer() {
    pauseTimer();
    timeRemaining = 0;
    isWorkPhase = true;
    currentRound = 1;
    document.getElementById('timer-display').textContent = "00:00";
    const timer = document.getElementById('chrono-container');
    const phaseLabel = document.getElementById('timer-phase');
    if(timer) timer.dataset.phase = 'work';
    if(phaseLabel) phaseLabel.textContent = 'Prêt à travailler';
}

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
        let avatar = u.avatar ? `<img src="${escapeHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '👤';
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
    const settings = {
        ...(currentUser.profile.settings || {}),
        autoMessageDisabled: document.getElementById('coach-setting-automessage').checked
    };
    try {
        await savePrivateProfile(currentUser.id, { 'profile.settings': settings });
        currentUser.profile.settings = settings;
        closeModal('modal-coach-settings');
    } catch(error) {
        console.error("Erreur d'enregistrement des paramètres du coach:", error);
        alert("Impossible d'enregistrer les paramètres : " + error.message);
    }
}

// Lancement Initial
initApp();
