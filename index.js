const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// allow form submissions
app.use(express.urlencoded({ extended: true }));

// in-memory data store
let posts = [];

// home page
app.get('/', (req, res) => {
  let html = `
    <h1>AdjitTime Timeline</h1>
    <form method="POST" action="/add-post">
      <input type="text" name="username" placeholder="Your name" required />
      <input type="text" name="message" placeholder="Your message" required />
      <button type="submit">Post</button>
    </form>
    <ul>
  `;
  for (let post of posts) {
    html += `<li><strong>${post.username}:</strong> ${post.message} <em>(${post.time})</em></li>`;
  }
  html += `</ul>`;
  res.send(html);
});

// handle form submission
app.post('/add-post', (req, res) => {
  const { username, message } = req.body;
  posts.push({
    username,
    message,
    time: new Date().toLocaleString()
  });
  res.redirect('/');
});

// start server
app.listen(PORT, () => {
  console.log(`✅ AdjitTime running at http://localhost:${PORT}`);
});
