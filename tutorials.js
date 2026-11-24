// === TUTORIELS ===
// Un petit tutoriel s'affiche la première fois qu'un membre ouvre un onglet, et un tutoriel « nouveautés »
// s'affiche une fois après une grosse mise à jour. Tous peuvent être revus dans Paramètres > Tutoriels.
//
// Comment les faire évoluer :
//  - Nouvel onglet : ajouter une entrée dans TAB_TUTORIALS (clé = nom de l'onglet passé à switchTab).
//  - Onglet très modifié : augmenter son « version » → le tutoriel se réaffiche une fois pour tout le monde.
//  - Grosse mise à jour : ajouter une entrée EN TÊTE de UPDATE_TUTORIALS avec un id unique (ex. 'maj-2027-01').
//
// Ce fichier ne fait que déclarer des fonctions : il est chargé avant app.js.
// Les tutoriels déjà vus sont retenus sur l'appareil, par compte (localStorage).
//
// Chaque étape : { title, text, target? (sélecteur CSS de l'élément à montrer), when? () => booléen,
//                 requiresTarget? (étape sautée si l'élément n'est pas affiché pour ce membre) }

const TAB_TUTORIALS = {
    'coach-dashboard': {
        version: 1,
        title: 'Séances & Blocs',
        steps: [
            {
                title: 'Votre espace entraînement',
                text: "Ici, vous préparez les entraînements : des blocs (exercices) que vous assemblez en séances, puis que vous attribuez à vos membres."
            },
            {
                title: 'Créer un bloc ou une séance',
                text: "« Créer un bloc » : un exercice avec sa catégorie et ses consignes. « Créer une séance » : choisissez des blocs et mettez-les dans l'ordre.",
                target: '#coach-dashboard-space > .flex-between'
            },
            {
                title: 'Trois bibliothèques',
                text: "Mes séances : visibles par vous seul. Bibliothèque du club : partagées avec votre club. Bibliothèque : partagées par tous les clubs, à dupliquer pour les reprendre à votre compte.",
                target: '#coach-session-tabs'
            },
            {
                title: 'Vos séances',
                text: "Sur chaque séance : « Partager » la publie dans une bibliothèque ; les icônes servent à dupliquer, modifier ou supprimer. « Attribuer » l'envoie à vos membres.",
                demo: 'sessionCard',
                target: '.session-card-actions'
            },
            {
                title: 'Attribuer une séance',
                text: "Choisissez des membres ou tout un groupe. « Nombre de fois » (ex. 2×) donne la séance plusieurs fois, pour la faire deux fois dans la semaine. « Déjà à faire » signale qu'il l'a encore en attente.",
                demo: 'assign',
                target: '.assignment-repeat',
                when: () => hasCoachRights()
            },
            {
                title: 'Vos blocs',
                text: "Tous vos exercices sont rangés ici. Filtrez-les par catégorie ou recherchez-les par nom.",
                target: '#coach-blocks-grid'
            },
            {
                title: 'Activités & alertes',
                text: "Quand un membre termine une séance ou signale une grosse fatigue, l'information apparaît en haut de cet onglet.",
                target: '#coach-notifications',
                requiresTarget: true
            }
        ]
    },
    'coach-athletes': {
        version: 1,
        title: 'Membres du club',
        steps: [
            {
                title: 'Vos membres, par groupes',
                text: "Retrouvez tous les membres du club, rangés par groupes. Ouvrez un groupe pour voir ses membres.",
                target: '#coach-groups-view'
            },
            {
                title: 'Gérer mes groupes',
                text: "Créez des groupes (nom, photo, membres) : vous pourrez ensuite attribuer une séance à tout un groupe en un clic.",
                target: '#coach-athletes-space .flex-between button'
            },
            {
                title: "La fiche d'un membre",
                text: "Touchez un membre pour ouvrir sa fiche (ici un profil fictif) : objectifs, cycles en cours, compétences et compétitions.",
                demo: 'memberProfile'
            },
            {
                title: 'Le calendrier',
                text: "Touchez un jour pour choisir Repos, Entraînement (rouge) ou Compétition (or, avec son nom). Vous pouvez y lier une séance (vert une fois faite) et ajouter une note.",
                demo: 'memberCalendar',
                target: '.calendar-grid'
            },
            {
                title: 'Historique et bilans',
                text: "L'onglet « Historique Séances » liste ses séances. Ouvrez-en une réalisée : son bilan (plaisir, difficulté, fatigue, notes) s'affiche en premier.",
                demo: 'memberHistory',
                target: '.tutorial-demo-report'
            },
            {
                title: 'Notifications et rôles',
                text: "Dans un groupe, « Activer les notifications » vous prévient quand ses membres terminent une séance. Le gérant peut changer le rôle d'un membre depuis sa fiche."
            },
            {
                title: 'Messagerie',
                text: "Pour écrire à un membre ou à un groupe, utilisez la bulle de messagerie.",
                target: '.chat-btn-float'
            }
        ]
    },
    'athlete-sessions': {
        version: 1,
        title: 'Mes séances',
        steps: [
            {
                title: 'Vos séances à faire',
                text: "Les séances que vos coachs vous ont attribuées. Une séance à faire deux fois dans la semaine apparaît deux fois.",
                target: '#classic-sessions-grid'
            },
            {
                title: 'Faire une séance',
                text: "Ouvrez une séance (ici un exemple) pour voir ses exercices dans l'ordre. Sous chaque exercice, glissez le curseur pour noter votre effort de 1 à 10.",
                demo: 'session',
                target: '.rpe-container'
            },
            {
                title: 'Le chronomètre',
                text: "L'icône chronomètre, en haut de la séance, lance un minuteur travail / repos avec des bips.",
                demo: 'session',
                target: '.tutorial-demo-chrono'
            },
            {
                title: 'Le bilan',
                text: "En fin de séance, remplissez le bilan : plaisir, difficulté, fatigue et une note libre. Validez : votre coach le reçoit.",
                demo: 'sessionReview',
                target: '.session-review-metrics'
            },
            {
                title: 'Historique',
                text: "Vos séances terminées sont rangées ici. Vous pouvez les rouvrir pour revoir ce que vous avez fait.",
                target: '#done-sessions-grid'
            }
        ]
    },
    'athlete-club-members': {
        version: 1,
        title: 'Membres du club',
        steps: [
            {
                title: 'Les membres de votre club',
                text: "La liste de tous les membres du club. Utilisez la recherche pour trouver quelqu'un rapidement.",
                target: '#athlete-club-members-grid'
            },
            {
                title: 'Messagerie',
                text: "Pour écrire à un membre ou à votre coach, utilisez la bulle de messagerie.",
                target: '.chat-btn-float'
            }
        ]
    },
    'athlete-club-sessions': {
        version: 1,
        title: 'Séances du club',
        steps: [
            {
                title: 'Les séances partagées',
                text: "Les séances que les coachs et gérants ont partagées avec le club. Ouvrez-en une pour voir son contenu et vous en inspirer.",
                target: '#athlete-club-sessions-grid'
            }
        ]
    },
    'athlete-profile': {
        version: 1,
        title: 'Mon profil',
        steps: [
            {
                title: 'Photo et objectifs',
                text: "Ajoutez une photo et notez vos objectifs : vos coachs les voient sur votre fiche. Pensez à « Enregistrer ».",
                target: '#athlete-profile-space .profile-header'
            },
            {
                title: "Cycles d'entraînement",
                text: "Un cycle fixe un nombre de séances à faire sur une période. Les séances terminées pendant cette période sont comptées automatiquement.",
                target: '#profile-cycles-list'
            },
            {
                title: 'Mon calendrier',
                text: "Touchez un jour pour indiquer Repos, Entraînement (rouge) ou Compétition (or, avec son nom). Vous pouvez y lier une séance et ajouter une note.",
                target: '#athlete-calendar-container'
            },
            {
                title: 'Compétences et compétitions',
                text: "« Mettre à jour mon profil » : évaluez vos compétences, affichées sous forme de toile. Notez aussi vos compétitions et votre ressenti.",
                target: '#athlete-profile-space .charts-container'
            },
            {
                title: 'Demander un rôle',
                text: "Vous encadrez au club ? Demandez un rôle (initiateur, coach…) : la demande part aux gérants.",
                target: '#role-request-section',
                requiresTarget: true
            },
            {
                title: 'Notifications et installation',
                text: "Tout en bas : activez les notifications sur cet appareil et installez l'application sur votre écran d'accueil.",
                target: '#push-entry',
                requiresTarget: true
            }
        ]
    },
    'school': {
        version: 1,
        title: "École d'escalade",
        steps: [
            {
                title: "L'école d'escalade",
                text: "Les cours récurrents du club : dates, élèves, présences et séances prévues."
            },
            {
                title: 'Créer un cours',
                text: "Choisissez nom, couleur, jours, horaires et nombre de séances. Les dates sont calculées automatiquement et peuvent sauter les vacances scolaires.",
                target: '#school-create-course',
                requiresTarget: true
            },
            {
                title: "Faire l'appel",
                text: "Ouvrez un cours pour faire l'appel à chaque date (« Tous présents » pour aller vite) et prévoir la séance du jour.",
                target: '#school-courses-view',
                requiresTarget: true
            },
            {
                title: 'Mes cours',
                text: "Retrouvez vos cours, leurs dates et vos présences.",
                target: '#school-student-courses',
                requiresTarget: true
            }
        ]
    },
    'settings': {
        version: 1,
        title: 'Paramètres',
        steps: [
            {
                title: 'Apparence',
                text: "Choisissez le thème clair ou sombre pour cet appareil.",
                target: '#settings-space .theme-switch'
            },
            {
                title: 'Mes clubs',
                text: "Changez de club actif, rejoignez un autre club, ou créez le vôtre : tout le monde peut créer un club et en devient le gérant.",
                target: '#profile-clubs-list'
            },
            {
                title: 'Compte et famille',
                text: "Changez votre e-mail ou votre mot de passe. Un parent peut lier le compte de son enfant grâce au code parent de l'enfant."
            },
            {
                title: 'Revoir les tutoriels',
                text: "Tous les tutoriels sont rangés ici : touchez « Revoir » pour en relancer un.",
                target: '#settings-tutorials-section'
            }
        ]
    },
    'platform-admin': {
        version: 1,
        title: 'Administration',
        steps: [
            {
                title: 'Administration de la plateforme',
                text: "Suivez l'activité de tous les clubs sur une période, et ouvrez un club avec « Gérer le club » pour intervenir comme gérant."
            }
        ]
    }
};

// Tutoriels de mise à jour : le plus récent en premier. Chacun s'affiche une seule fois, à l'ouverture de l'appli.
// Exemple :
// { id: 'maj-2027-01', title: 'Nouveautés de janvier', steps: [ { title: '…', text: '…' } ] }
const UPDATE_TUTORIALS = [];

let activeTutorial = null;
let tutorialPendingTimer = null;

function getTutorialStorageKey() {
    const uid = typeof auth !== 'undefined' && auth.currentUser ? auth.currentUser.uid : 'anonyme';
    return 'ffme-tutorials-seen:' + uid;
}
function getSeenTutorials() {
    try { return JSON.parse(localStorage.getItem(getTutorialStorageKey()) || '{}') || {}; } catch(error) { return {}; }
}
function markTutorialSeen(id, version) {
    const seen = getSeenTutorials();
    seen[id] = version;
    try { localStorage.setItem(getTutorialStorageKey(), JSON.stringify(seen)); } catch(error) { /* stockage indisponible */ }
}

function getTutorialById(id) {
    if(TAB_TUTORIALS[id]) return { id, ...TAB_TUTORIALS[id] };
    const update = UPDATE_TUTORIALS.find(item => item.id === id);
    return update ? { version: 1, ...update } : null;
}

// Étapes qui concernent ce membre (rôle, activités du club)
function getTutorialSteps(tutorial) {
    return tutorial.steps.filter(step => {
        if(step.requiresTarget && !getTutorialTarget(step)) return false;
        try { return !step.when || step.when(); } catch(error) { return true; }
    });
}

function isTutorialTabAvailable(tab) {
    if(tab === 'settings') return true;
    if(tab === 'platform-admin') return typeof isPlatformAdmin === 'function' && isPlatformAdmin();
    const navButton = document.getElementById('nav-' + tab);
    return Boolean(navButton && navButton.style.display !== 'none' && getComputedStyle(navButton).display !== 'none');
}

function isBlockingOverlayOpen() {
    if(activeTutorial) return true;
    const authScreen = document.getElementById('auth-screen');
    if(authScreen && authScreen.style.display !== 'none') return true;
    const dialog = document.getElementById('app-dialog-overlay');
    if(dialog && dialog.style.display !== 'none') return true;
    return [...document.querySelectorAll('.modal-overlay')].some(modal => modal.style.display === 'flex');
}

// Appelé à chaque changement d'onglet. Léger délai : l'onglet est affiché et, au démarrage,
// seul le dernier onglet ouvert (par défaut puis onglet restauré) déclenche son tutoriel.
function maybeShowTutorials() {
    clearTimeout(tutorialPendingTimer);
    tutorialPendingTimer = setTimeout(() => {
        if(typeof currentUser === 'undefined' || !currentUser || isBlockingOverlayOpen()) return;
        const seen = getSeenTutorials();
        const update = UPDATE_TUTORIALS.find(item => !seen[item.id]);
        if(update) return openTutorial(update.id, { afterClose: maybeShowTutorials });
        const activeSpace = document.querySelector('.tab-content.active');
        const tab = activeSpace ? activeSpace.id.replace(/-space$/, '') : '';
        const tutorial = TAB_TUTORIALS[tab];
        if(tutorial && (seen[tab] || 0) < tutorial.version) openTutorial(tab);
    }, 450);
}

function openTutorial(id, options = {}) {
    const tutorial = getTutorialById(id);
    if(!tutorial) return;
    closeTutorial(false);
    // « Revoir » depuis les paramètres : on ouvre l'onglet concerné pour montrer les éléments
    if(options.goToTab && TAB_TUTORIALS[id] && isTutorialTabAvailable(id) && typeof switchTab === 'function') {
        switchTab(id);
        clearTimeout(tutorialPendingTimer);
    }
    // Étapes calculées une fois l'onglet affiché (certaines dépendent des éléments visibles)
    const steps = getTutorialSteps(tutorial);
    if(!steps.length) return markTutorialSeen(tutorial.id, tutorial.version);
    activeTutorial = { tutorial, steps, index: 0, afterClose: options.afterClose || null };
    buildTutorialElements();
    renderTutorialStep();
}

function buildTutorialElements() {
    if(document.getElementById('tutorial-backdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'tutorial-backdrop';
    backdrop.className = 'tutorial-backdrop';
    const ring = document.createElement('div');
    ring.id = 'tutorial-ring';
    ring.className = 'tutorial-ring';
    ring.hidden = true;
    const card = document.createElement('section');
    card.id = 'tutorial-card';
    card.className = 'tutorial-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tutorial-step-title');
    card.tabIndex = -1;
    document.body.append(backdrop, ring, card);
    window.addEventListener('resize', positionTutorial);
    window.addEventListener('scroll', positionTutorial, true);
    document.addEventListener('keydown', handleTutorialKeydown);
}

// Pour une étape avec démo, la cible est cherchée dans l'écran fictif
function getTutorialTarget(step) {
    if(!step.target) return null;
    const scope = step.demo ? document.getElementById('tutorial-demo') : document;
    const element = scope ? scope.querySelector(step.target) : null;
    if(!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? element : null;
}

function renderTutorialStep() {
    if(!activeTutorial) return;
    const { tutorial, steps, index } = activeTutorial;
    const step = steps[index];
    const isLast = index === steps.length - 1;
    const card = document.getElementById('tutorial-card');
    card.innerHTML = `
        <div class="tutorial-card-top">
            <span class="tutorial-kicker">${escapeHtml(tutorial.title)}${steps.length > 1 ? ` · ${index + 1}/${steps.length}` : ''}</span>
            <button type="button" class="tutorial-skip" onclick="closeTutorial()">${isLast ? 'Fermer' : 'Passer'}</button>
        </div>
        <h3 id="tutorial-step-title">${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.text)}</p>
        <div class="tutorial-card-bottom">
            <div class="tutorial-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i === index ? 'active' : ''}"></span>`).join('')}</div>
            <div class="tutorial-actions">
                ${index > 0 ? '<button type="button" class="btn-outline" onclick="tutorialStep(-1)">Précédent</button>' : ''}
                <button type="button" class="btn-primary" onclick="${isLast ? 'closeTutorial()' : 'tutorialStep(1)'}">${isLast ? "C'est compris" : 'Suivant'}</button>
            </div>
        </div>`;
    renderTutorialDemo(step);
    const target = getTutorialTarget(step);
    activeTutorial.target = target;
    activeTutorial.hasDemo = Boolean(step.demo && TUTORIAL_DEMOS[step.demo]);
    if(target) target.scrollIntoView({ block: activeTutorial.hasDemo ? 'nearest' : 'center', behavior: 'smooth' });
    positionTutorial();
    // Le défilement doux déplace la cible : on recale l'anneau une fois arrivé
    setTimeout(positionTutorial, 350);
    card.focus({ preventScroll: true });
}

function positionTutorial() {
    if(!activeTutorial) return;
    const ring = document.getElementById('tutorial-ring');
    const card = document.getElementById('tutorial-card');
    const target = activeTutorial.target;
    card.classList.remove('is-top', 'is-bottom', 'is-center');
    if(!target || !target.isConnected) {
        ring.hidden = true;
        // Avec une démo (en haut de l'écran), l'explication reste en bas
        card.classList.add(activeTutorial.hasDemo ? 'is-bottom' : 'is-center');
        return;
    }
    const rect = target.getBoundingClientRect();
    const margin = 6;
    const viewportHeight = window.innerHeight;
    const top = Math.max(rect.top - margin, 4);
    const bottom = Math.min(rect.bottom + margin, viewportHeight - 4);
    ring.hidden = bottom <= top;
    ring.style.top = `${top}px`;
    ring.style.left = `${Math.max(rect.left - margin, 4)}px`;
    ring.style.width = `${Math.min(rect.width + margin * 2, window.innerWidth - 8)}px`;
    ring.style.height = `${bottom - top}px`;
    // La carte se place du côté opposé à l'élément montré
    const targetCenter = (top + bottom) / 2;
    card.classList.add(activeTutorial.hasDemo || targetCenter <= viewportHeight / 2 ? 'is-bottom' : 'is-top');
}

// === ÉCRANS FICTIFS (démos) ===
// Reproduisent les vrais écrans avec les styles de l'application, sans aucune donnée réelle ni écriture :
// ils ne sont pas cliquables (inert) et disparaissent avec le tutoriel.
function renderTutorialDemo(step) {
    let demo = document.getElementById('tutorial-demo');
    const builder = step.demo && TUTORIAL_DEMOS[step.demo];
    if(!builder) {
        if(demo) demo.remove();
        return;
    }
    if(!demo) {
        demo = document.createElement('div');
        demo.id = 'tutorial-demo';
        demo.className = 'tutorial-demo';
        demo.setAttribute('inert', '');
        demo.setAttribute('aria-hidden', 'true');
        document.getElementById('tutorial-ring').before(demo);
    }
    if(demo.dataset.demo !== step.demo) {
        demo.dataset.demo = step.demo;
        demo.innerHTML = `<div class="tutorial-demo-badge">Exemple fictif</div>${builder()}`;
        demo.scrollTop = 0;
    }
}

const TUTORIAL_DEMO_MEMBER = { name: 'Alex Exemple', initial: 'A', subtitle: 'Athlète · Groupe Compétition' };

function tutorialDemoMemberHeader(activeTab = 'profil') {
    return `
        <div class="tutorial-demo-header">
            <span class="tutorial-demo-avatar">${TUTORIAL_DEMO_MEMBER.initial}</span>
            <div><strong>${TUTORIAL_DEMO_MEMBER.name}</strong><small>${TUTORIAL_DEMO_MEMBER.subtitle}</small></div>
        </div>
        <div class="internal-tabs tutorial-demo-tabs">
            <button type="button" class="${activeTab === 'profil' ? 'active' : ''}">Profil & Objectifs</button>
            <button type="button" class="${activeTab === 'historique' ? 'active' : ''}">Historique Séances</button>
        </div>`;
}

// Mois en cours, avec quelques jours d'exemple (mêmes classes que le vrai calendrier)
function tutorialDemoCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const weekdays = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let start = new Date(year, month, 1).getDay();
    start = start === 0 ? 6 : start - 1;
    const examples = {
        4: { status: 'training', session: 'Force & doigts', done: true },
        6: { status: 'training' },
        9: { status: 'training', session: 'Endurance continuité' },
        12: { status: 'rest', note: 'Kiné 18h' },
        14: { status: 'competition', competition: 'Coupe régionale de bloc' },
        18: { status: 'training', session: 'Force & doigts' },
        21: { status: 'competition', competition: 'Open de difficulté' }
    };
    let grid = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => `<div class="calendar-day-name">${day}</div>`).join('');
    let agenda = '';
    for(let i = 0; i < start; i++) grid += '<div></div>';
    for(let d = 1; d <= daysInMonth; d++) {
        const day = examples[d];
        let cls = 'calendar-day';
        if(day && day.status === 'training') cls += ' active-day';
        if(day && day.status === 'competition') cls += ' competition-day';
        if(day && day.session) cls += ' has-session';
        if(day && day.done) cls += ' session-done';
        if(day && day.note) cls += ' has-note';
        grid += `<div class="${cls}"><span class="day-number">${d}</span>${
            day && day.competition ? `<div class="cal-competition-indicator">${day.competition}</div>` : ''}${
            day && day.session ? `<span class="cal-session-indicator">${day.session}</span>` : ''}${
            day && day.note ? `<div class="cal-note-indicator">${day.note}</div>` : ''}<span class="cal-dots"></span></div>`;
        if(day) {
            const label = { rest: 'Repos', training: 'Entraînement', competition: 'Compétition' }[day.status];
            agenda += `<div class="calendar-agenda-item${day.status === 'training' ? ' active-day' : ''}${day.status === 'competition' ? ' competition-day' : ''}${day.done ? ' session-done' : ''}">
                <span class="calendar-agenda-date"><small>${weekdays[new Date(year, month, d).getDay()]}</small><strong>${d}</strong></span>
                <span class="calendar-agenda-body">
                    <span class="calendar-agenda-status">${label}${day.done ? ' · Réalisée' : ''}</span>
                    ${day.competition ? `<span class="calendar-agenda-competition">${day.competition}</span>` : ''}
                    ${day.session ? `<span class="calendar-agenda-session">${day.session}</span>` : ''}
                    ${day.note ? `<span class="calendar-agenda-note">${day.note}</span>` : ''}
                </span>
            </div>`;
        }
    }
    return `
        <div class="calendar-header"><span class="btn-icon tutorial-demo-nav">&lt;</span><h3 style="margin:0;">${months[month]} ${year}</h3><span class="btn-icon tutorial-demo-nav">&gt;</span></div>
        <div class="calendar-grid">${grid}</div>
        <div class="calendar-agenda">${agenda}</div>`;
}

const TUTORIAL_CHRONO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5"/></svg>';

function tutorialDemoRpe(value, label, color) {
    return `
        <div class="rpe-container">
            <div class="rpe-header">
                <span class="rpe-title">Ressenti d'effort</span>
                <span class="rpe-badge" style="background-color:${color};">${value}/10 · ${label}</span>
            </div>
            <input type="range" class="rpe-slider-custom" min="1" max="10" value="${value}" style="--rpe-color:${color};" disabled tabindex="-1">
            <div class="rpe-scale-labels"><span>1 - Repos</span><span>5 - Moyen</span><span>10 - Max</span></div>
        </div>`;
}

function tutorialDemoMetric(label, value, color) {
    return `<div class="tutorial-demo-metric"><small>${label}</small><strong style="color:${color};">${value}</strong></div>`;
}

const TUTORIAL_DEMOS = {
    memberProfile: () => `
        ${tutorialDemoMemberHeader('profil')}
        <div class="profile-section"><h3>Objectifs</h3><p class="tutorial-demo-text">Enchaîner du 7a en bloc d'ici juin et préparer la coupe régionale.</p></div>
        <div class="profile-section"><h3>Cycles d'entraînement</h3>
            <div class="tutorial-demo-cycle"><div><strong>Préparation régionale</strong><small>8 / 12 séances</small></div><span class="tutorial-demo-progress"><span style="width:66%;"></span></span></div>
        </div>
        <div class="profile-section"><h3>Compétitions</h3><div class="comp-item"><b>Bloc</b> - Coupe régionale<br><span style="font-size:0.9rem; color:var(--text-muted);">Bonnes sensations, 2 tops sur 4.</span></div></div>`,
    memberCalendar: () => `
        ${tutorialDemoMemberHeader('profil')}
        <div class="profile-section"><h3>Calendrier</h3>${tutorialDemoCalendar()}</div>`,
    memberHistory: () => `
        ${tutorialDemoMemberHeader('historique')}
        <div class="tutorial-demo-report">
            <h3>Force & doigts <small>· réalisée</small></h3>
            <div class="tutorial-demo-metrics">
                ${tutorialDemoMetric('Plaisir', 8, 'var(--ffme-blue)')}
                ${tutorialDemoMetric('Difficulté', 6, '#F59E0B')}
                ${tutorialDemoMetric('Fatigue', 7, 'var(--ffme-red)')}
            </div>
            <div class="tutorial-demo-note">Dur sur la fin, mais j'ai tenu toutes les suspensions.</div>
        </div>`,
    session: () => `
        <div class="tutorial-demo-session-head"><strong>Force & doigts</strong><span class="btn-outline chrono-toggle tutorial-demo-chrono">${TUTORIAL_CHRONO_ICON}</span></div>
        <div class="athlete-block-card">
            <div class="card-category" style="margin-bottom:0.5rem;">Échauffement</div>
            <div style="font-weight:800; font-size:1.05rem; margin-bottom:0.4rem; color:var(--ffme-blue-dark);">1. Mobilité et voies faciles</div>
            <div style="font-size:0.9rem; color:var(--text-dark);">15 min de mobilité, puis 3 voies faciles en continu.</div>
            ${tutorialDemoRpe(3, 'Très facile', '#22C55E')}
        </div>
        <div class="athlete-block-card">
            <div class="card-category" style="margin-bottom:0.5rem;">Force</div>
            <div style="font-weight:800; font-size:1.05rem; margin-bottom:0.4rem; color:var(--ffme-blue-dark);">2. Suspensions 10 s / 20 s</div>
            <div style="font-size:0.9rem; color:var(--text-dark);">5 séries de 6 suspensions sur réglette de 20 mm.</div>
            ${tutorialDemoRpe(8, 'Très dur', '#F97316')}
        </div>`,
    sessionReview: () => `
        <section class="session-review">
            <div class="session-review-heading"><div><h3>Bilan de la séance</h3><p>Comment s'est passée ta séance dans l'ensemble ?</p></div></div>
            <div class="session-review-metrics">
                ${[['Plaisir', 8, 'Aucun', 'Énorme'], ['Difficulté', 6, 'Très facile', 'Extrême'], ['Fatigue', 7, 'Frais', 'Épuisé']].map(([label, value, low, high]) => `
                <div class="review-metric">
                    <div class="review-metric-top"><label>${label}</label><span class="review-metric-value"><span>${value}</span>/10</span></div>
                    <input type="range" class="rpe-slider-custom review-slider" min="1" max="10" value="${value}" disabled tabindex="-1">
                    <div class="review-metric-scale"><span>${low}</span><span>${high}</span></div>
                </div>`).join('')}
            </div>
            <div class="tutorial-demo-note">Dur sur la fin, mais j'ai tenu toutes les suspensions.</div>
            <span class="btn-primary tutorial-demo-button">Marquer la séance comme terminée</span>
        </section>`,
    sessionCard: () => `
        <div class="card">
            <div class="card-header" style="align-items:flex-start;">
                <div class="card-title" style="flex:1;">Force & doigts</div>
                <div class="tutorial-demo-icons"><span>Dupliquer</span><span>Modifier</span><span>Supprimer</span></div>
            </div>
            <p class="session-card-meta">4 exercices</p>
            <div class="session-card-assigned">En cours par : Alex Exemple (2×), Sam Exemple</div>
            <div class="session-card-actions"><span class="btn-outline">Partager</span><span class="btn-primary">Attribuer</span></div>
        </div>`,
    assign: () => `
        <h3 style="margin:0 0 0.75rem;">Attribuer une séance</h3>
        <div class="group-member-picker assignment-member-picker">
            ${[['Alex Exemple', 'Athlète', true, 1], ['Sam Exemple', 'Athlète', true, 0], ['Léa Exemple', 'Athlète', false, 0]].map(([name, role, selected, pending]) => `
            <div class="group-member-option assignment-member-option${selected ? ' selected' : ''}">
                <span class="group-member-avatar group-member-avatar-placeholder">${name.charAt(0)}</span>
                <span class="group-member-details"><strong>${name}</strong><small>${role}${pending ? ' · <span class="assignment-member-pending-tag">déjà à faire</span>' : ''}</small></span>
            </div>`).join('')}
        </div>
        <div class="assignment-repeat"><div><strong>Nombre de fois</strong><small>Ex. 2× pour faire la séance deux fois dans la semaine</small></div><div class="assignment-repeat-stepper"><span class="btn-icon">−</span><span>2×</span><span class="btn-icon">+</span></div></div>
        <span class="btn-primary tutorial-demo-button">Valider l'attribution</span>`
};

function tutorialStep(delta) {
    if(!activeTutorial) return;
    const next = activeTutorial.index + delta;
    if(next < 0 || next >= activeTutorial.steps.length) return;
    activeTutorial.index = next;
    renderTutorialStep();
}

function handleTutorialKeydown(event) {
    if(!activeTutorial) return;
    if(event.key === 'Escape') { event.preventDefault(); closeTutorial(); }
    else if(event.key === 'ArrowRight') tutorialStep(1);
    else if(event.key === 'ArrowLeft') tutorialStep(-1);
}

// markSeen = false : fermeture technique (remplacement par un autre tutoriel)
function closeTutorial(markSeen = true) {
    if(!activeTutorial) return;
    const { tutorial, afterClose } = activeTutorial;
    if(markSeen) markTutorialSeen(tutorial.id, tutorial.version);
    activeTutorial = null;
    ['tutorial-backdrop', 'tutorial-demo', 'tutorial-ring', 'tutorial-card'].forEach(id => {
        const element = document.getElementById(id);
        if(element) element.remove();
    });
    window.removeEventListener('resize', positionTutorial);
    window.removeEventListener('scroll', positionTutorial, true);
    document.removeEventListener('keydown', handleTutorialKeydown);
    if(markSeen && afterClose) afterClose();
}

// Paramètres > Tutoriels : liste de ceux qui concernent ce membre
function renderSettingsTutorials() {
    const list = document.getElementById('settings-tutorials-list');
    if(!list) return;
    const updates = UPDATE_TUTORIALS.map(item => ({ id: item.id, title: item.title, detail: 'Nouveautés' }));
    const tabs = Object.entries(TAB_TUTORIALS)
        .filter(([tab]) => isTutorialTabAvailable(tab))
        .map(([tab, tutorial]) => ({ id: tab, title: tutorial.title, detail: 'Onglet' }));
    list.innerHTML = [...updates, ...tabs].map(item => `
        <div class="settings-tutorial-item">
            <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>
            <button type="button" class="btn-outline" onclick="openTutorial('${escapeHtml(item.id)}', { goToTab: true })">Revoir</button>
        </div>`).join('') || '<p class="settings-hint">Aucun tutoriel disponible.</p>';
}
