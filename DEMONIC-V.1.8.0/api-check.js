const axios = require('axios');
const urls = [
  { name: 'Jikan anime search', url: 'https://api.jikan.moe/v4/anime?q=naruto&limit=1' },
  { name: 'TikWM', url: 'https://tikwm.com/api/?url=https://www.tiktok.com/@scout2015/video/6718335390845095173&hd=1' },
  { name: 'SnapInsta', url: 'https://snapinsta.io/download?url=https://www.instagram.com/p/CQ1q1w9BqWY/' },
  { name: 'FBStuff', url: 'https://getfbstuff.com/api/v1/video?url=https://www.facebook.com/watch/?v=10156045576200052' },
  { name: 'APKCombo', url: 'https://apkcombo.org/api/v1/search?q=whatsapp' },
  { name: 'YouTube RapidAPI check', url: 'https://yt-api.p.rapidapi.com/dl?id=https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
];

(async () => {
  for (const item of urls) {
    try {
      const res = await axios.get(item.url, { timeout: 20000 });
      console.log(item.name + ': ' + res.status + ' ' + res.statusText);
    } catch (e) {
      console.log(item.name + ': ERROR ' + (e.message || ''));
      if (e.response) {
        console.log('  status=' + e.response.status + ' body=' + JSON.stringify(e.response.data).slice(0, 180));
      }
    }
  }
})();
