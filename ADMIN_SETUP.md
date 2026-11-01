# Activer l’espace administrateur — guide pas à pas

Ce guide est destiné à la personne qui gère le projet Firebase et la publication du site. Il n’est pas nécessaire de modifier le code pour attribuer le rôle admin, mais il faut publier les règles et la nouvelle version du site.

## Ce qu’il faut préparer

- L’accès au compte Google qui gère le projet Firebase `ffme-plateforme-entrainement`.
- L’adresse e-mail du compte qui deviendra administrateur. Ce compte doit déjà exister dans Firebase Authentication et son adresse e-mail doit être vérifiée.
- L’accès à l’endroit où le site est publié (Firebase Hosting, GitHub Pages ou autre). Le dépôt ne contient pas de configuration Firebase Hosting ; la méthode exacte de publication du site dépend donc de votre hébergeur actuel.

Ne communiquez à personne votre mot de passe, un code de connexion, ni une clé de compte de service Firebase.

Important : le claim admin ne vous ajoute à aucun club. En revanche, il ne supprime pas une appartenance à un club qui existe déjà dans les données. Si le compte choisi apparaît actuellement dans l’annuaire d’un club et que vous souhaitez qu’il n’y apparaisse plus, ne supprimez pas de données vous-même : demandez d’abord de l’aide pour retirer proprement cette ancienne appartenance.

## Étape 1 — Retrouver l’UID du compte admin

L’UID est l’identifiant technique du compte Firebase. Il ne s’agit pas de l’adresse e-mail.

1. Ouvrez [la console Firebase](https://console.firebase.google.com/).
2. Sélectionnez le projet **ffme-plateforme-entrainement**.
3. Dans le menu de gauche, ouvrez **Authentication**, puis l’onglet **Users / Utilisateurs**.
4. Recherchez l’adresse e-mail du compte que vous souhaitez utiliser comme admin.
5. Copiez la valeur affichée dans la colonne **User UID / UID utilisateur** et gardez-la pour l’étape 4.

Le compte admin existe déjà : utilisez-le plutôt que d’en créer un autre. N’en créez pas un depuis l’écran d’inscription de l’application sans demander conseil, car l’inscription normale ajoute aussi le nouveau compte à un club.

## Étape 2 — Publier les règles Firestore

Les règles protègent les données. Il faut publier la version du fichier [firestore.rules.txt](./firestore.rules.txt) avant de publier le site qui enregistre les statistiques.

1. Dans la console Firebase du même projet, ouvrez **Firestore Database** dans le menu **Build / Créer**.
2. Ouvrez l’onglet **Rules / Règles**.
3. Dans le fichier [firestore.rules.txt](./firestore.rules.txt) de ce dossier, sélectionnez et copiez **tout le contenu**, de la première ligne `rules_version = '2';` jusqu’à la dernière accolade `}`.
4. Remplacez tout le texte de l’éditeur de règles Firebase par ce contenu.
5. Vérifiez que vous êtes toujours dans le projet **ffme-plateforme-entrainement**, puis cliquez sur **Publish / Publier**.
6. Attendez la confirmation de publication.

Ne publiez pas un extrait du fichier et ne supprimez pas les règles existantes : le fichier complet contient aussi les règles utilisées par les clubs et les comptes habituels.

## Étape 3 — Publier la nouvelle version du site

Publiez les fichiers de cette version du site avec **la même méthode que celle utilisée pour mettre le site en ligne actuellement**. La nouvelle version comprend notamment [app.js](./app.js), [index.html](./index.html) et [styles.css](./styles.css).

La configuration présente ici indique le fichier de règles Firestore, mais ne précise pas l’hébergeur du site. Par conséquent :

- si votre site est déjà publié avec Firebase Hosting, utilisez votre procédure Firebase Hosting habituelle ;
- si votre site est publié par un autre service, mettez à jour les fichiers sur ce service comme vous le faites d’habitude ;
- si vous ne savez pas où le site est publié, arrêtez-vous et demandez à la personne qui s’en occupe. Ne lancez pas une commande de déploiement au hasard.

Attendez que la nouvelle version soit effectivement en ligne avant de poursuivre.

## Étape 4 — Donner le droit admin au compte (Google Cloud Shell)

Le bouton d’administration est caché dans le site, mais ce masquage ne protège pas les données. La vraie autorisation est un droit spécial (`admin: true`) attribué au compte dans Firebase Authentication. Cette opération se fait dans un environnement sécurisé, **jamais dans le code du site**.

### 4.1 Ouvrir Cloud Shell

1. Ouvrez [la console Google Cloud](https://console.cloud.google.com/).
2. Sélectionnez le projet **ffme-plateforme-entrainement** en haut de la page.
3. Cliquez sur l’icône **Activer Cloud Shell** en haut à droite (icône de terminal `>_`) et attendez que le terminal s’ouvre en bas de l’écran.
4. Dans le terminal, exécutez :

```bash
gcloud config set project ffme-plateforme-entrainement
gcloud auth application-default login
```

La deuxième commande affiche un lien de connexion Google. Ouvrez ce lien, connectez-vous avec le compte qui a le droit d’administrer le projet, autorisez l’accès, puis revenez dans Cloud Shell. Si Google Cloud indique que l’autorisation est déjà disponible, continuez.

### 4.2 Installer l’outil d’administration

Dans Cloud Shell, exécutez :

```bash
npm install firebase-admin
```

Attendez la fin de l’installation avant de passer à la commande suivante.

### 4.3 Attribuer le droit au bon UID

Copiez la commande ci-dessous dans Cloud Shell en remplaçant **UNIQUEMENT** `COLLER_ICI_UID` par l’UID copié à l’étape 1. Gardez les apostrophes autour de l’UID et ne mettez pas l’adresse e-mail à la place :

```bash
node -e 'const {initializeApp, applicationDefault}=require("firebase-admin/app"); const {getAuth}=require("firebase-admin/auth"); initializeApp({credential:applicationDefault(), projectId:"ffme-plateforme-entrainement"}); (async()=>{const auth=getAuth(); const user=await auth.getUser("COLLER_ICI_UID"); if(!user.emailVerified) throw new Error("Adresse e-mail non vérifiée."); await auth.setCustomUserClaims(user.uid,{...(user.customClaims||{}),admin:true}); console.log("Droit admin activé pour",user.email,"(UID:",user.uid,")");})().catch(error=>{console.error(error);process.exit(1);});'
```

Exemple de remplacement : si l’UID fourni par Firebase est `abc123`, le morceau de commande doit contenir `auth.getUser("abc123")`.

La commande conserve les éventuels autres droits techniques du compte et ajoute le droit admin. Elle ne modifie pas les rôles des clubs. **Ne partagez pas la sortie complète du terminal si elle contient des informations de compte.**

Si la commande répond `PERMISSION_DENIED`, votre compte Google n’a probablement pas le droit d’administrer Firebase Authentication pour ce projet. Demandez au propriétaire du projet de vous accorder l’autorisation ou de réaliser lui-même l’étape 4.

## Étape 5 — Se connecter et vérifier

1. Ouvrez la nouvelle version du site.
2. Déconnectez-vous si un compte est déjà connecté.
3. Connectez-vous avec l’adresse e-mail et le mot de passe du compte admin. Utilisez l’adresse e-mail vérifiée.
4. Le compte conserve son profil et ses appartenances habituelles. Dans **Mon Profil**, le bouton **Administration** apparaît si le claim `admin: true` a bien été attribué au compte connecté.
5. Dans l’interface d’administration, le tableau présente les indicateurs par club. La section **Gestion des clubs** permet d’ouvrir les vues de gérant d’un club sans ajouter le compte admin à ses membres ni à son annuaire. Seules les appartenances déjà présentes dans le profil classique restent visibles.
6. Ouvrez le sélecteur de période pour consulter un mois ou une année.

Si le bouton n’apparaît pas, déconnectez-vous complètement et reconnectez-vous : les droits Firebase sont enregistrés dans un jeton qui doit être renouvelé. Vérifiez aussi que le claim a été ajouté au bon UID et que vous consultez la nouvelle version du site.

Si la page apparaît, mais affiche une erreur de chargement, vérifiez que les règles Firestore de l’étape 2 ont bien été publiées sur le bon projet. La console du navigateur peut fournir le détail de l’erreur.

## Comprendre les chiffres

- **Compte actif sur 14 jours** : compte distinct ayant ouvert une session durant les 14 derniers jours.
- **Compte actif sur la période choisie** : compte distinct ayant ouvert une session durant le mois ou l’année affiché(e).
- **Séances créées** : nouvelles séances, copies et séances partagées créées après publication de cette version du site.
- **Séances réalisées** : première validation d’une attribution après publication ; modifier un bilan déjà validé ne la compte pas une deuxième fois.
- Le suivi démarre après publication des nouvelles règles et du nouveau site. Les données plus anciennes ne sont pas reconstituées.
- Le tableau n’affiche ni les noms des athlètes, ni leurs bilans, commentaires ou détails d’entraînement.

## Retirer le droit admin

Si le compte ne doit plus être administrateur, demandez à une personne autorisée à gérer Firebase Authentication de retirer le claim `admin` via Firebase Admin SDK. Il ne faut pas simplement cacher le bouton : les règles Firebase doivent aussi recevoir un jeton sans ce droit. Déconnectez ensuite le compte et reconnectez-le pour que le changement soit pris en compte.
