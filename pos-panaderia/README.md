
# POS Panadería (Next.js + Firebase)

- Autenticación Email/Password (Firebase Auth)
- Productos con coste, margen, **stock** y **umbral bajo**
- POS: agrega por **código** (ideal para pistola lectora), **valida stock**, **cobra** y descuenta stock en **transacción**
- Historial de ventas con exportación CSV
- Ajustes: umbral global y listado de **stock bajo**

## Variables de entorno (Vercel)
Configurar en **Project Settings → Environment Variables**:

- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID

## Reglas Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }

    match /products/{code} {
      allow read, write: if signedIn();
    }
    match /sales/{id} {
      allow read, write: if signedIn();
    }
    match /settings/{doc} {
      allow read, write: if signedIn();
    }
  }
}
```
