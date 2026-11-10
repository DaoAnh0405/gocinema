module.exports = (email) => {
  const [name, domain] = String(email).split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};