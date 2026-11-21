# Notifications push : mise en ligne du Worker Cloudflare

Ce dossier contient le petit serveur qui envoie les notifications aux téléphones.
Tout se fait dans le navigateur, sans rien installer.

---

## Étape 1 : générer les clés de notification (une seule fois)

1. Ouvre n'importe quelle page dans Chrome ou Edge, puis ouvre la console : **F12**, onglet **Console**.
2. Colle ce code et appuie sur **Entrée** :

```js
(async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const publicKey = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.privateKey));
  console.log('VAPID_PUBLIC_KEY =\n' + publicKey);
  console.log('VAPID_PRIVATE_JWK =\n' + privateJwk);
})();
```

3. Copie les deux valeurs affichées dans un endroit sûr.
   - `VAPID_PUBLIC_KEY` : clé publique, sans danger.
   - `VAPID_PRIVATE_JWK` : clé privée, **à ne jamais publier ni mettre dans l'app**.

---

## Étape 2 : créer le Worker

1. Crée un compte gratuit sur <https://dash.cloudflare.com/sign-up>. Aucune carte bancaire n'est demandée.
2. Dans le menu de gauche, va dans **Workers & Pages**, puis **Create**, puis **Create Worker**.
3. Donne-lui un nom, par exemple `ffme-hdf-entrainement`, puis clique sur **Deploy**.
4. Clique sur **Edit code**. Efface tout le code présent, colle le contenu de [`worker.js`](worker.js), puis clique sur **Deploy**.
5. Note l'adresse du Worker, affichée en haut. Elle ressemble à `https://ffme-hdf-entrainement.<ton-compte>.workers.dev`.

---

## Étape 3 : configurer le Worker

Dans le Worker, va dans **Settings**, puis **Variables and Secrets**, puis **Add**. Ajoute :

| Nom | Type | Valeur |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Text | `ffme-plateforme-entrainement` |
| `ALLOWED_ORIGINS` | Text | Les adresses de ton app, séparées par des virgules. Ex. `https://ffme-plateforme-entrainement.web.app,http://localhost:3000` |
| `VAPID_PUBLIC_KEY` | Text | La clé publique de l'étape 1 |
| `VAPID_PRIVATE_JWK` | **Secret** | La clé privée de l'étape 1 (tout le texte entre `{` et `}`) |
| `VAPID_SUBJECT` | Text | Une adresse de contact, ex. `mailto:contact@tonclub.fr` |

Clique sur **Deploy** pour enregistrer.

> `ALLOWED_ORIGINS` doit contenir l'adresse **exacte** depuis laquelle l'app est ouverte, sans `/` à la fin.
> Pour tester avec Live Preview dans VS Code, ajoute `http://localhost:3000`, ou `http://127.0.0.1:3000` selon l'adresse affichée.

---

## Étape 4 : brancher l'app

En haut de [`app.js`](../app.js), remplis :

```js
const PUSH_CONFIG = {
    workerUrl: 'https://ffme-hdf-entrainement.<ton-compte>.workers.dev',
    vapidPublicKey: '<la clé publique de l’étape 1>'
};
```

Puis publie les **règles Firestore** mises à jour (fichier `firestore.rules.txt`, collection `pushSubscriptions`).

---

## Étape 5 : tester

1. Sur le téléphone de l'athlète, ouvre l'app. **Sur iPhone, installe-la d'abord sur l'écran d'accueil** (iOS 16.4 ou plus récent).
2. Dans **Mon profil**, tout en bas, touche **Activer les notifications**, puis accepte la demande d'autorisation.
3. Depuis un compte coach, attribue une séance à cet athlète : une notification **« Nouvelle séance ! »** arrive.
4. Attribue-lui plusieurs séances à la suite : la notification se met à jour en **« Tu as reçu N séances ! »**, sans nouvelle vibration.
5. Quand l'athlète ouvre l'app, le compteur repart de zéro.

### En cas de problème

- **Aucune notification** : dans le Worker, va dans **Logs**, puis **Begin log stream**, et refais une attribution pour voir les erreurs.
- **Erreur « Origine non autorisée »** : l'adresse de l'app n'est pas exactement dans `ALLOWED_ORIGINS`.
- **Rien sur iPhone** : l'app doit être ouverte depuis l'icône de l'écran d'accueil, pas depuis Safari.

---

## Coût

L'offre gratuite de Cloudflare Workers permet environ **100 000 appels par jour**, bien au-delà des besoins d'un club.
Chaque attribution de séance fait **un seul appel**, quel que soit le nombre d'athlètes concernés.
