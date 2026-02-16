import * as vscode from 'vscode';
import snowflake from 'snowflake-sdk';

function getSnowflakeConfig() {
	const config = vscode.workspace.getConfiguration('engMetrics.snowflake');
	const account = config.get<string>('account', '');
	const username = config.get<string>('username', '');
	const password = config.get<string>('password', '');
	const database = config.get<string>('database', '');
	const schema = config.get<string>('schema', 'PUBLIC');
	const warehouse = config.get<string>('warehouse', '');

	if (!account) {
		throw new Error('Snowflake account is not configured. Set "engMetrics.snowflake.account" in VS Code settings.');
	}
	if (!username) {
		throw new Error('Snowflake username is not configured. Set "engMetrics.snowflake.username" in VS Code settings.');
	}
	if (!password) {
		throw new Error('Snowflake password is not configured. Set "engMetrics.snowflake.password" in VS Code settings.');
	}
	if (!database) {
		throw new Error('Snowflake database is not configured. Set "engMetrics.snowflake.database" in VS Code settings.');
	}
	if (!warehouse) {
		throw new Error('Snowflake warehouse is not configured. Set "engMetrics.snowflake.warehouse" in VS Code settings.');
	}

	return { account, username, password, database, schema, warehouse };
}

export function getSnowflakeConnection(): Promise<snowflake.Connection> {
	const { account, username, password, database, schema, warehouse } = getSnowflakeConfig();

	const connection = snowflake.createConnection({
		account,
		username,
		password,
		database,
		schema,
		warehouse,
	});

	return new Promise((resolve, reject) => {
		connection.connect((err, conn) => {
			if (err) {
				reject(new Error(`Failed to connect to Snowflake: ${err.message}`));
			} else {
				resolve(conn);
			}
		});
	});
}

export function executeStatement(connection: snowflake.Connection, sqlText: string, binds?: snowflake.Binds): Promise<unknown[]> {
	return new Promise((resolve, reject) => {
		connection.execute({
			sqlText,
			binds,
			complete: (err, _stmt, rows) => {
				if (err) {
					reject(new Error(`Snowflake query failed: ${err.message}`));
				} else {
					resolve(rows ?? []);
				}
			},
		});
	});
}
