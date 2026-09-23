require('./server').start().catch(err=>{console.error(err.message);process.exit(1);});
