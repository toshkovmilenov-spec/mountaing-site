import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseFile = path.join(__dirname, 'mountain-board.sqlite');
const app = express();
const port = process.env.PORT || 3001;
const jwtSecret = process.env.JWT_SECRET || 'planinski-informator-local-secret';

app.use(cors());
app.use(express.json());

const SQL = await initSqlJs({ locateFile: (fileName) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', fileName) });
const rawDatabase = fs.existsSync(databaseFile) ? new SQL.Database(new Uint8Array(fs.readFileSync(databaseFile))) : new SQL.Database();
let isTransactionOpen = false;

function persistDatabase() {
  fs.writeFileSync(databaseFile, Buffer.from(rawDatabase.export()));
}

function createStatement(query) {
  return {
    get(...parameters) {
      const statement = rawDatabase.prepare(query);
      statement.bind(parameters);
      const result = statement.step() ? statement.getAsObject() : undefined;
      statement.free();
      return result;
    },
    all(...parameters) {
      const statement = rawDatabase.prepare(query);
      statement.bind(parameters);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      statement.free();
      return rows;
    },
    run(...parameters) {
      const statement = rawDatabase.prepare(query);
      statement.bind(parameters);
      statement.step();
      statement.free();
      const lastInsertRowid = rawDatabase.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
      const result = { changes: rawDatabase.getRowsModified(), lastInsertRowid };
      if (!isTransactionOpen) persistDatabase();
      return result;
    }
  };
}

const database = {
  exec(query) { rawDatabase.exec(query); persistDatabase(); },
  prepare(query) { return createStatement(query); },
  transaction(callback) { return (...args) => { rawDatabase.exec('BEGIN'); isTransactionOpen = true; try { const result = callback(...args); rawDatabase.exec('COMMIT'); isTransactionOpen = false; persistDatabase(); return result; } catch (error) { isTransactionOpen = false; rawDatabase.exec('ROLLBACK'); throw error; } }; }
};

function runDatabaseQuery(query, parameters = []) {
  return query.trim().toUpperCase().startsWith('SELECT') ? database.prepare(query).all(...parameters) : database.prepare(query).run(...parameters);
}

function createDatabaseSchema() {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mountain TEXT NOT NULL,
      description TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Пътека',
      place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Информация',
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedDatabase() {
  const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync('planina123', 10);
    database.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('планинар', passwordHash);
  }

  const author = database.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  const placeNames = [
    ['Хижа Алеко', 'Витоша', 'Популярна отправна точка за Черни връх и високите части на Витоша.'],
    ['Седемте рилски езера', 'Рила', 'Маршрут с красиви панорами, който изисква добра екипировка и внимание при променливо време.'],
    ['Хижа Мусала', 'Рила', 'Основна база за изкачване на най-високия връх на Балканския полуостров.'],
    ['Хижа Вихрен', 'Пирин', 'Изходна точка към Вихрен, Казана и Кончето. Каменисти и технични участъци.'],
    ['Беклемето', 'Стара планина', 'Проход и туристическа зона с достъпни високопланински маршрути.'],
    ['Екопътека Бяла река', 'Стара планина', 'Сенчеста кръгова екопътека с мостове и информационни табели.'],
    ['Мальовица', 'Рила', 'Алпийски район с разнообразни маршрути и бързо променящо се време.'],
    ['Каньонът на водопадите', 'Родопи', 'Горска пътека край река с множество водопади и хлъзгави камъни.']
  ];
  const insertPlace = database.prepare('INSERT INTO places (name, mountain, description, created_by) VALUES (?, ?, ?, ?)');
  const insertPlaces = database.transaction(() => placeNames.forEach((place) => {
    const existingPlace = database.prepare('SELECT id FROM places WHERE name = ?').get(place[0]);
    if (!existingPlace) insertPlace.run(...place, author.id);
  }));
  insertPlaces();

  const postCount = database.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
  if (postCount < 100) {
    const places = database.prepare('SELECT id, name, mountain FROM places ORDER BY id').all();
    const categories = ['Пътека', 'Безопасност', 'Инфраструктура', 'Време'];
    const observations = [
      'Пътеката е проходима и маркировката се вижда добре.',
      'На места има кал след валежи. Препоръчват се водоустойчиви обувки.',
      'Мостчето е стабилно, но мокрите дъски са хлъзгави.',
      'Работата по почистването от храсти приключи тази година.',
      'В горната част няма мобилен обхват. Носете зареден телефон и свирка.',
      'Има паднали клони след вятър; преминаването е възможно с повишено внимание.',
      'Изворът е пълноводен и водата е обозначена като годна за пиене.',
      'Мъглата намалява видимостта. Следвайте стриктно маркировката.'
    ];
    const insertPost = database.prepare('INSERT INTO posts (title, content, category, place_id, author_id) VALUES (?, ?, ?, ?, ?)');
    const insertPosts = database.transaction(() => {
      for (let index = postCount; index < 100; index += 1) {
        const place = places[index % places.length];
        const category = categories[index % categories.length];
        const observation = observations[index % observations.length];
        insertPost.run(`${category}: ${place.name}`, `${observation} Проверено от общността на ${place.mountain}.`, category, place.id, author.id);
      }
    });
    insertPosts();
  }
}

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, jwtSecret, { expiresIn: '7d' });
}

function requireAuthentication(request, response, next) {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return response.status(401).json({ message: 'Необходимо е да влезете в профила си.' });
  try {
    request.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return response.status(401).json({ message: 'Сесията е изтекла. Влезте отново.' });
  }
}

function validateText(value, fieldName, maximumLength = 5000) {
  if (typeof value !== 'string' || value.trim().length === 0) return `${fieldName} е задължително поле.`;
  if (value.trim().length > maximumLength) return `${fieldName} е прекалено дълго.`;
  return null;
}

createDatabaseSchema();
seedDatabase();

app.post('/api/auth/register', (request, response) => {
  const { username, password } = request.body;
  const usernameError = validateText(username, 'Потребителското име', 40);
  if (usernameError) return response.status(400).json({ message: usernameError });
  if (typeof password !== 'string' || password.length < 6) return response.status(400).json({ message: 'Паролата трябва да е поне 6 символа.' });
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = database.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username.trim(), passwordHash);
    const user = { id: result.lastInsertRowid, username: username.trim() };
    return response.status(201).json({ token: createToken(user), user });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ message: 'Това потребителско име вече съществува.' });
    return response.status(500).json({ message: 'Регистрацията не беше успешна.' });
  }
});

app.post('/api/auth/login', (request, response) => {
  const { username, password } = request.body;
  const user = database.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username?.trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return response.status(401).json({ message: 'Грешно потребителско име или парола.' });
  return response.json({ token: createToken(user), user: { id: user.id, username: user.username } });
});

app.get('/api/me', requireAuthentication, (request, response) => response.json({ user: request.user }));

app.get('/api/places', (request, response) => {
  const search = `%${(request.query.search || '').trim()}%`;
  const places = database.prepare(`
    SELECT places.*, users.username AS creator_name,
      (SELECT COUNT(*) FROM updates WHERE updates.place_id = places.id) AS update_count
    FROM places LEFT JOIN users ON users.id = places.created_by
    WHERE places.name LIKE ? OR places.mountain LIKE ? OR places.description LIKE ?
    ORDER BY places.name COLLATE NOCASE
  `).all(search, search, search);
  return response.json({ places });
});

app.post('/api/places', requireAuthentication, (request, response) => {
  const { name, mountain, description } = request.body;
  const errors = [validateText(name, 'Името на мястото', 100), validateText(mountain, 'Планината', 80), validateText(description, 'Описанието', 1000)].filter(Boolean);
  if (errors.length) return response.status(400).json({ message: errors[0] });
  const result = database.prepare('INSERT INTO places (name, mountain, description, created_by) VALUES (?, ?, ?, ?)').run(name.trim(), mountain.trim(), description.trim(), request.user.id);
  return response.status(201).json({ place: database.prepare('SELECT * FROM places WHERE id = ?').get(result.lastInsertRowid) });
});

app.get('/api/places/:placeId/updates', (request, response) => {
  const updates = database.prepare(`
    SELECT updates.*, users.username AS author_name
    FROM updates JOIN users ON users.id = updates.author_id
    WHERE place_id = ? ORDER BY created_at DESC
  `).all(request.params.placeId);
  return response.json({ updates });
});

app.post('/api/places/:placeId/updates', requireAuthentication, (request, response) => {
  const { content, status = 'Информация' } = request.body;
  const contentError = validateText(content, 'Текстът на обновяването', 2000);
  const place = database.prepare('SELECT id FROM places WHERE id = ?').get(request.params.placeId);
  if (contentError) return response.status(400).json({ message: contentError });
  if (!place) return response.status(404).json({ message: 'Мястото не е намерено.' });
  const result = database.prepare('INSERT INTO updates (place_id, content, status, author_id) VALUES (?, ?, ?, ?)').run(place.id, content.trim(), status, request.user.id);
  return response.status(201).json({ update: database.prepare(`SELECT updates.*, users.username AS author_name FROM updates JOIN users ON users.id = updates.author_id WHERE updates.id = ?`).get(result.lastInsertRowid) });
});

app.put('/api/updates/:updateId', requireAuthentication, (request, response) => {
  const update = database.prepare('SELECT * FROM updates WHERE id = ?').get(request.params.updateId);
  if (!update) return response.status(404).json({ message: 'Обновяването не е намерено.' });
  if (update.author_id !== request.user.id) return response.status(403).json({ message: 'Можете да редактирате само свои обновявания.' });
  const contentError = validateText(request.body.content, 'Текстът на обновяването', 2000);
  if (contentError) return response.status(400).json({ message: contentError });
  database.prepare('UPDATE updates SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(request.body.content.trim(), request.body.status || update.status, update.id);
  return response.json({ update: database.prepare(`SELECT updates.*, users.username AS author_name FROM updates JOIN users ON users.id = updates.author_id WHERE updates.id = ?`).get(update.id) });
});

app.delete('/api/updates/:updateId', requireAuthentication, (request, response) => {
  const update = database.prepare('SELECT * FROM updates WHERE id = ?').get(request.params.updateId);
  if (!update) return response.status(404).json({ message: 'Обновяването не е намерено.' });
  if (update.author_id !== request.user.id) return response.status(403).json({ message: 'Можете да изтривате само свои обновявания.' });
  database.prepare('DELETE FROM updates WHERE id = ?').run(update.id);
  return response.status(204).send();
});

app.get('/api/posts', (request, response) => {
  const search = `%${(request.query.search || '').trim()}%`;
  const posts = database.prepare(`
    SELECT posts.*, users.username AS author_name, places.name AS place_name, places.mountain
    FROM posts JOIN users ON users.id = posts.author_id LEFT JOIN places ON places.id = posts.place_id
    WHERE posts.title LIKE ? OR posts.content LIKE ? OR places.name LIKE ? OR places.mountain LIKE ?
    ORDER BY posts.created_at DESC LIMIT 200
  `).all(search, search, search, search);
  return response.json({ posts });
});

app.post('/api/posts', requireAuthentication, (request, response) => {
  const { title, content, category = 'Пътека', placeId = null } = request.body;
  const errors = [validateText(title, 'Заглавието', 160), validateText(content, 'Съдържанието', 5000)].filter(Boolean);
  if (errors.length) return response.status(400).json({ message: errors[0] });
  const result = database.prepare('INSERT INTO posts (title, content, category, place_id, author_id) VALUES (?, ?, ?, ?, ?)').run(title.trim(), content.trim(), category, placeId || null, request.user.id);
  return response.status(201).json({ post: database.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid) });
});

app.put('/api/posts/:postId', requireAuthentication, (request, response) => {
  const post = database.prepare('SELECT * FROM posts WHERE id = ?').get(request.params.postId);
  if (!post) return response.status(404).json({ message: 'Публикацията не е намерена.' });
  if (post.author_id !== request.user.id) return response.status(403).json({ message: 'Можете да редактирате само свои публикации.' });
  const errors = [validateText(request.body.title, 'Заглавието', 160), validateText(request.body.content, 'Съдържанието', 5000)].filter(Boolean);
  if (errors.length) return response.status(400).json({ message: errors[0] });
  database.prepare('UPDATE posts SET title = ?, content = ?, category = ?, place_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(request.body.title.trim(), request.body.content.trim(), request.body.category || post.category, request.body.placeId || null, post.id);
  return response.json({ post: database.prepare('SELECT * FROM posts WHERE id = ?').get(post.id) });
});

app.delete('/api/posts/:postId', requireAuthentication, (request, response) => {
  const post = database.prepare('SELECT * FROM posts WHERE id = ?').get(request.params.postId);
  if (!post) return response.status(404).json({ message: 'Публикацията не е намерена.' });
  if (post.author_id !== request.user.id) return response.status(403).json({ message: 'Можете да изтривате само свои публикации.' });
  database.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  return response.status(204).send();
});

app.get('/api/stats', (request, response) => {
  const stats = {
    places: database.prepare('SELECT COUNT(*) AS count FROM places').get().count,
    posts: database.prepare('SELECT COUNT(*) AS count FROM posts').get().count,
    updates: database.prepare('SELECT COUNT(*) AS count FROM updates').get().count,
    mountains: database.prepare('SELECT COUNT(DISTINCT mountain) AS count FROM places').get().count
  };
  return response.json({ stats });
});

app.listen(port, () => console.log(`Планински информатор API работи на http://localhost:${port}`));
