// مصادر قاعدة بيانات المواقع الخطيرة (IBRA Shield)
const SOURCES = [
  { id: 'urlhaus', kind: 'malware', name: 'URLhaus — مواقع البرمجيات الخبيثة', url: 'https://urlhaus.abuse.ch/downloads/hostfile/' },
  { id: 'phishing-db', kind: 'phishing', name: 'Phishing.Database — مواقع التصيد النشطة', url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt' },
  { id: 'blp-phishing', kind: 'phishing', name: 'Block List Project — تصيد', url: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/phishing.txt' },
  { id: 'blp-scam', kind: 'scam', name: 'Block List Project — احتيال', url: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/scam.txt' },
]
module.exports = { SOURCES }
