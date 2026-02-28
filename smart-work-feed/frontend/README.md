
# 🌍 Smart Work Feed

### Plateforme IA de Recommandation d’Emplois Touristiques

---

## 🚀 Vision du Projet

**Smart Work Feed** est une plateforme intelligente conçue pour moderniser le secteur touristique en Tunisie 🇹🇳.

Le projet combine :

* 🛒 **La logique d’Amazon** → recommandations personnalisées
* 🎥 **L’algorithme de TikTok** → feed dynamique qui apprend du comportement
* 🤖 **Une Intelligence Artificielle interne** → responsable du matching et du classement

L’objectif est de créer un système où :

* 👷 Les travailleurs reçoivent les meilleures offres adaptées à leur profil
* 🏨 Les entreprises reçoivent les meilleurs candidats
* 🧠 L’IA décide automatiquement des suggestions

---

## 🎯 Problématique

Le marché du travail touristique souffre de :

* Manque d’organisation digitale intelligente
* Difficulté à trouver rapidement le bon profil
* Absence d’un système de confiance fiable
* Pas de recommandations basées sur les données

---

## 💡 Notre Solution

Un système de **Feed intelligent** qui fonctionne comme TikTok :

### 👷 Feed Travailleur

Lorsqu’un travailleur se connecte, le système affiche :

* Les emplois les plus adaptés à ses compétences
* Les opportunités proches géographiquement
* Les missions compatibles avec sa disponibilité
* Les offres avec entreprises bien notées
* Les propositions optimisées selon son comportement (view, apply, skip…)

---

### 🏨 Feed Entreprise

Lorsqu’une entreprise publie une offre :

* Le système classe automatiquement les meilleurs candidats
* Les profils sont triés selon :

  * Similarité IA (embeddings)
  * Score de confiance
  * Disponibilité
  * Localisation
  * Historique comportemental

---

## 🧠 Architecture IA

### 1️⃣ Similarité Vectorielle (Embeddings)

Les profils et les offres sont transformés en vecteurs numériques via :

```
text-embedding-3-small
```

Puis on calcule :

```
Cosine Similarity
```

---

### 2️⃣ Signaux Comportementaux

Le système analyse :

* view
* click
* save
* apply
* skip
* cancel

Ces données influencent le classement via une fonction mathématique (sigmoid).

---

### 3️⃣ Système de Confiance (Trust Score)

Basé sur :

* Les évaluations (ratings)
* La moyenne des étoiles
* Les annulations fréquentes

---

### 4️⃣ Formule de Score Final

Exemple pour Travailleur → Emploi :

```
Score Final =
(similarity × 0.35) +
(location × 0.20) +
(availability × 0.15) +
(trust × 0.15) +
(behavior × 0.10) +
(freshness × 0.05)
```

---

## 🏗 Stack Technique

### Backend

* Node.js
* Express
* SQLite
* OpenAI API
* Zod (validation)

### Frontend

* React
* TailwindCSS
* Vite

### Modèles IA

* text-embedding-3-small
* gpt-4o-mini

---

## 📂 Structure du Projet

```
backend/
  src/
    server.js
    db.js
    ai.js
  data.sqlite

frontend/
  src/
    App.jsx
```

---

## 🔥 Endpoints Principaux

* `POST /users`
* `POST /jobs`
* `GET /feed/jobs?userId=1`
* `GET /feed/candidates?jobId=1`
* `POST /events`
* `POST /ratings`

---

## ⚙️ Installation

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 🌟 Ce Qui Rend Ce Projet Unique

* Feed dynamique inspiré de TikTok
* Matching basé sur IA vectorielle
* Système de confiance intégré
* Apprentissage à partir du comportement
* Adapté spécifiquement au marché touristique tunisien
* Architecture évolutive et scalable

---

## 🔮 Perspectives d’Évolution

* Calcul précis de distance géographique
* Prédiction saisonnière des besoins
* Détection de fraude par IA
* Application mobile
* Tableau de bord analytique avancé

---

## 👨‍💻 Auteur

Projet conçu et développé par **Marwen**
Avec une architecture IA innovante pour transformer l’emploi touristique en Tunisie 🇹🇳

---

Si tu veux, Marwen, je peux maintenant te faire :

* 📘 Une version académique formelle pour soutenance
* 🎤 Un texte de pitch pour concours/startup
* 📊 Un document d’architecture technique détaillé
* 🧠 Une explication mathématique avancée de l’algorithme

Dis-moi ce que tu veux améliorer 💪
