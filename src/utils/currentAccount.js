exports.accountIdOf = (req) => {
  const u = (req.session && req.session.user) || {};
  return Number(u.id ?? u.accountId ?? u.account_id);
};