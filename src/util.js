const execa = require('execa');

const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getNotarizationInfo = async (requestUuid, username, password) => {
  const { stdout, stderr } = await execa('xcrun', [
    'altool',
    '--notarization-info',
    requestUuid,
    '--username',
    username,
    '--password',
    password,
    '--output-format',
    'json',
  ]);
  let notarizationInfo;
  let tryLegacy = false;

  try {
    notarizationInfo = JSON.parse(stdout)['notarization-info'];
  } catch (error) {
    tryLegacy = true;
    console.error(`Could not parse as JSON. Will try legacy mode.`);
  }
  const parseLegacyNotarizationInfo = (response) => {
    const uuidMatches = response.match(/RequestUUID.\s(.*)\s*/);
    const dateMatches = response.match(/Date.\s(.*)\s*/);
    const statusMatches = response.match(/Status.\s(.*)\s/);
    const logFileURLMatches = response.match(/LogFileURL.\s(.*)\s/);
    const statusCodeMatches = response.match(/Status Code.\s(.*)\s/);
    const statusMessageMatches = response.match(/Status Message.\s(.*)\s/);

    return {
      RequestUUID: uuidMatches ? uuidMatches[1] : '',
      Date: dateMatches ? dateMatches[1] : '',
      Status: statusMatches ? statusMatches[1] : '',
      LogFileURL: logFileURLMatches ? logFileURLMatches[1] : '',
      StatusCode: statusCodeMatches ? statusCodeMatches[1] : '',
      StatusMessage: statusMessageMatches ? statusMessageMatches[1] : '',
    };
  };

  if (tryLegacy) {
    try {
      notarizationInfo = parseLegacyNotarizationInfo(stderr);
    } catch (error) {
      console.error(
        `Could not parse as legacy key/value pairs: ${error} stdout: ${stdout}. stderr: ${stderr}`,
      );
    }
  }
  return notarizationInfo;
};

const getRequestStatus = async (requestUuid, username, password) => {
  const info = await getNotarizationInfo(requestUuid, username, password);
  return info ? info.Status : 'unknown';
};

const notarizeApp = async (file, bundleId, provider, username, password) => {
  let failed;
  const xcrunArgs = ['altool', '--notarize-app'];
  if (file !== undefined) {
    xcrunArgs.push('--file', file);
  }
  if (bundleId !== undefined) {
    xcrunArgs.push('--primary-bundle-id', bundleId);
  }
  if (provider !== undefined) {
    xcrunArgs.push('--asc-provider', provider);
  }
  if (username !== undefined) {
    xcrunArgs.push('--username', username);
  }
  if (password !== undefined) {
    xcrunArgs.push('--password', password);
  }
  xcrunArgs.push('--output-format', 'json');
  const { stdout, stderr } = await execa('xcrun', xcrunArgs).catch((error2) => {
    failed = true;
    return error2;
  });
  let requestUuid;
  let error;
  if (failed) {
    try {
      error = JSON.parse(stdout)['product-errors'][0].message;
    } catch (error2) {
      console.error(
        `Error parsing product errors: ${error2}. Stdout: ${stdout}. Stderr: ${stderr}`,
      );
    }
  } else {
    let parseLegacyUUID = false;
    try {
      requestUuid = JSON.parse(stdout)['notarization-upload'].RequestUUID;
    } catch (error2) {
      parseLegacyUUID = true;
      console.error(`Error parsing UUID from JSON. Will try legacy mode.`);
    }

    if (parseLegacyUUID === true) {
      try {
        // Older versions of MacOS don't support the json output, so parse the structured output
        // RequestUUID = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const pattern = /RequestUUID\s=\s(.*)/;
        [, requestUuid] = stderr.match(pattern);
      } catch (error2) {
        console.error(
          `Error parsing UUID from structured data: ${error2}. Stdout: ${stdout}. Stderr: ${stderr}`,
        );
      }
    }
  }

  return { requestUuid, error };
};

const staple = async (file) => {
  const { stdout } = await execa('xcrun', ['stapler', 'staple', file]);
  return stdout;
};

module.exports = {
  sleep,
  getNotarizationInfo,
  getRequestStatus,
  notarizeApp,
  staple,
};
