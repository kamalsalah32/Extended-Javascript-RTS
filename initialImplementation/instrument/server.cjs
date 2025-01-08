/**
 * This File is based on the server implementation of NodeSRT
 * GitHub Repository: https://github.com/charlie-cyf/nodeSRT
 */
const express = require('express');
const fs = require('graceful-fs');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const app = express();
const cors = require('cors');
const port = 8888;

const {
  evaluationResultsFolder
} = require('../currentEvaluationRunConfig.cjs');

if (!fs.existsSync(evaluationResultsFolder)) {
  fs.mkdirSync(evaluationResultsFolder, { recursive: true });
}
let logPath = path.join(evaluationResultsFolder, 'dynamicDependencyGraph');
let logStream = fs.createWriteStream(logPath, { flags: 'a' });

app.use(bodyParser.json({ limit: '100mb', extended: true }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

app.post('/instrument-message', (req, res) => {
  try {
    logStream.write(req.body.msg);
  } catch (err) {
    res.status(500).send({ error: err });
  }
  res.send('ok');
});

app.post('/end-logstream', () => {
  logStream.end();
});

app.get('/log-path', (req, res) => {
  res.json({
    path: logPath
  });
});

app.listen(port, () =>
  console.log(`app listening at http://localhost:${port}`)
);
