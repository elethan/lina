export type LogLevel = 'info' | 'warn' | 'error';

function jsonLog(level: LogLevel, event: string, meta?: Record<string, unknown>) {
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...meta
    };

    const logString = JSON.stringify(payload);

    // Write standard logs to stdout, errors to stderr
    if (level === 'error') {
        process.stderr.write(logString + '\n');
    } else {
        process.stdout.write(logString + '\n');
    }
}

/**
 * Standardized JSON Logger.
 * Forces all application logs to be output as structured JSON to stdout/stderr 
 * so container orchestrators and enterprise security platforms can ingest them seamlessly.
 */
export const logger = {
    info: (event: string, meta?: Record<string, unknown>) => jsonLog('info', event, meta),
    warn: (event: string, meta?: Record<string, unknown>) => jsonLog('warn', event, meta),
    error: (event: string, meta?: Record<string, unknown>) => jsonLog('error', event, meta),
};
