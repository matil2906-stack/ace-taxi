const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.sendFile('index.html', {root: '.'}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('ACE TAXI OK'));
