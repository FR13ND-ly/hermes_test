/**
 *  In dieser Datei konfigurieren wir einen Express Webserver, der es uns ermöglicht,
 *  verschiedene Routen anzugeben und zu programmieren.
 *  Hier verzichten wir auf die Klassendefinition, da diese nicht nötig ist.
 *
 *  Weiterführende Links:
 *  https://expressjs.com/en/starter/basic-routing.html
 */

import errorHandler from 'errorhandler';
import express from 'express';
import path from 'path';
import cors from 'cors';
import morgan from 'morgan';

import aboutRoutes from './routes/about.routes'; 
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import equipmentMapRoutes from './routes/equipment-map.routes';
import equipmentRoutes from './routes/equipment.routes';
import cookieParser from 'cookie-parser';
import paymentRoutes from './routes/payment.routes';
import rentalRoutes from './routes/rental.routes';

// Express server instanziieren
const app = express();

/**
 *  Express Konfiguration.
 *  Normalerweise benutzt man Port 80 für HTTP (d.h. der Server wäre unter http://localhost erreichbar),
 *  aber da Ports unter 1024 nur von Administratoren geöffnet werden können, benutzen wir hier Port 8000.
 *  D.h. der Server ist unter http://localhost:8000 erreichbar. Für das Frontend werden alle Anfragen an
 *  '/api/' automatisch an diesen Server weitergeleitet (siehe "proxy.conf.json" im Frontend Projekt).
 */
app.set('port', 8000);

// "JSON" Daten verarbeiten falls der Request zusätzliche Daten im Request hat
app.use(express.json());
app.use(cookieParser());
// "UrlEncoded" Daten verarbeiten falls in der Request URL zusätzliche Daten stehen (normalerweise nicht nötig für Angular)
app.use(express.urlencoded({ extended: true }));
// Wir erlauben alle "Cross-Origin Requests". Normalerweise ist man hier etwas strikter, aber für den Softwareprojekt Kurs
// erlauben wir alles um eventuelle Fehler zu vermeiden.
app.use(morgan('dev'));


const allowedOrigins = [
  'http://localhost:4200',
  'https://swp.hermes-host.vip'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

/**
 *  API Routen festlegen
 *  Hier legen wir in dem "Express" Server neue Routen fest. Wir übergeben die Methoden
 *  unseres "ApiControllers", die dann aufgerufen werden sobald jemand die URL aufruft.
 *  Beispiel
 *  app.get('/api', api.getInfo);
 *       ↑     ↑          ↑
 *       |     |     Diese Methode wird aufgerufen, sobald ein Nutzer die angebene
 *       |     |     URL über einen HTTP GET Request aufruft.
 *       |     |
 *       |   Hier definieren sie die "Route", d.h. diese Route
 *       |   ist unter "http://localhost/api" verfügbar
 *       |
 *   Für diese Route erwarten wir einen GET Request.
 *   Auf derselben Route können wir auch einen POST
 *   Request angeben, für den dann eine andere Methode
 *   aufgerufen wird.
 *
 *  Weiterführende Links:
 *  - Übersicht über verschiedene HTTP Request methoden (GET / POST / PUT / DELETE) https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
 *  - REST Architektur: https://de.wikipedia.org/wiki/Representational_State_Transfer
 *
 *  Bitte schaut euch das Tutorial zur Backend-Entwicklung an für mehr Infos bzgl. REST
 */

app.get('/health', (req, res) => {
  res.status(200);
  res.send({
    message: 'Server is healthy',
  });
});

app.use('/api/users', userRoutes);
app.use('/api/about', aboutRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/equipments', equipmentRoutes);
app.use('/api/equipment-map', equipmentMapRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/rentals', rentalRoutes);

// Falls ein Fehler auftritt, gib den Stack trace aus
if (process.env.NODE_ENV === 'development') {
  app.use(errorHandler());
}

/**
 *  Dateien aus dem "public" und "img" Ordner werden direkt herausgegeben.
 *  D.h. falls eine Datei "myFile.txt" in dem "public" Ordner liegt, schickt der Server
 *  diese Datei wenn die "http://localhost/myFile.txt" URL aufgerufen wird.
 *  Dateien, die im 'img' Ordner liegen, können über den Pfad 'http://localhost/img/'
 *  abgerufen werden. 
 *  Zum Beispiel: http://localhost:8000/img/equipment/kubb.jpg
 *
 *  Das 'frontend/' Projekt wurde so konfiguriert, dass der 'build' Befehl (bzw. 'npm run build')
 *  im Frontend Projekt die 'transpilierten' Dateien in den 'public' Ordner des backend Projekt legen.
 *  Das kann nützlich sein, falls das ganze Projekt via Docker laufbar sein soll
 *  (erst nach Aushandeln für Bonuspunkte via User Story!)
 */
// app.use('/', express.static('public/browser'));
app.use('/img', express.static('img'));

/**
 *  Hier wird die "default Route" angegeben, d.h. falls der Server nicht weiß wie er auf "/random-request" antworten soll
 *  wird diese Methode aufgerufen. Das Frontend Angular hat selbst ein eigenes Routing, weswegen wir immer die "index" Seite
 *  von Angular schicken müssen. Falls eine der zuvor angegebenen Routen passt, wird diese Methode nicht aufgerufen.
 *  Diese Route funktioniert erst, sobald der 'build' Schritt im Frontend ausgeführt wurde und ist nur von Relevanz, falls
 *  das Projekt via Docker laufbar sein soll (siehe oben).
 */
// app.use((req, res) => {
//   res.sendFile(path.join(__dirname, '..', 'public/browser', 'index.html'));
// });

// Wir machen den konfigurierten Express Server für andere Dateien verfügbar, die diese z.B. Testen oder Starten können.
export default app;
