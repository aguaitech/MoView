import log from 'electron-log';

log.transports.file.level = 'info';
log.transports.console.level = 'info';

export const logger = log.scope('moview');

export default logger;
