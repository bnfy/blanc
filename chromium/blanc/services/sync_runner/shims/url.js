module.exports = {fileURLToPath: u => String(u).replace(/^file:\/\//, ""), pathToFileURL: p => ({href: `file://${p}`})};
