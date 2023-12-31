import { Router, Request, Response } from 'express';
import { PackageData, PackageID, PackageMetadata, PackageRating } from '../../schema';
import { connectToDatabase, tableName, dbName } from "../db";
import { downloadRepo, ZIP, decodeBase64AndExtract } from './post_package';
import { RowDataPacket } from 'mysql2';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from "../../logger_cfg";
import { fetchNpmDataWithAxios, getGithubUrlFromNpmData, getAllRatings } from "../../rate/analyze";
let getGithubUrl = require('get-github-url');
import * as pathModule from 'path';

// Initialize the router using Express
const router = Router();

// Construct the table name from the database name and table name
let table = `${dbName}.${tableName}`;

// Function to delete all ZIP files in a specified directory
export async function deleteAllZipFiles(directory: string): Promise<void> {
    try {
        // Logging the start of the deletion process
        logger.info(`Deleting all ZIP files in directory: ${directory}`);
        // Read all files in the directory
        const files = fs.readdirSync(directory);
        for (const file of files) {
            // Check if the file is a ZIP file
            if (path.extname(file) === '.zip') {
                // Delete the ZIP file
                fs.unlinkSync(path.join(directory, file));
                // Log the deletion of each file
                logger.debug(`Deleted ZIP file: ${file}`);
            }
        }
        // Log successful deletion of all ZIP files
        logger.info('Successfully deleted all ZIP files');
    } catch (error) {
        // Log any errors that occur
        logger.error(`Error deleting ZIP files: ${error}`);
        throw new Error(`500`);
    }
}

// Function to update a package in the database
async function updatePackage(packageId: PackageID, packageData: PackageData, packageMetadata: PackageMetadata): Promise<void> {
    let connection;
    try {
        // Establishing a connection to the database
        connection = await connectToDatabase();
    } catch (error) {
        // Handling connection errors
        logger.error(`Failed Database connection request in PUT. Error 500`);
        throw new Error('500')
    }
    try {
        // Fetching the package with the specified ID from the database
        logger.debug(`Fetching package with ID: ${packageId}`);
        const [selectResults] = await connection.execute<RowDataPacket[]>(
            `SELECT * FROM ${table} WHERE ID = ?`, [packageId]
        );

        // Extracting the package row from the query results
        const packageRow = selectResults[0];

        // Log package details
        logger.debug(`package Name: ${packageMetadata.Name}`);
        logger.debug(`package ID: ${packageRow.ID.toString()}`);

        // Proceed if the package name and ID match the provided metadata
        if (packageRow.Name === packageMetadata.Name && packageRow.ID.toString() === packageId) {
            let return_data;
            let url = packageData.URL || '';
            try {
                // Handling package data based on URL or Content
                if (packageData.URL) {
                    // Downloading the repository from the URL
                    logger.debug(`Downloading repo from URL: ${packageData.URL}`);
                    await downloadRepo(packageData.URL, 'rest_api/dump2');
                } else {
                    // Extracting the package content from Base64 encoded data
                    logger.debug('Decoding Base64 content and extracting');
                    const content: any = packageData.Content;
		            //logger.debug(`content: ${content}`);
                    await decodeBase64AndExtract(content, 'rest_api/dump2');

                    // get github url from package.json
                    logger.debug(`Extracting info from package.json`);
                    const packageJsonPath = pathModule.join('rest_api/dump2', 'package.json');
                    const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
		            //logger.debug(`JSONContent: ${packageJsonContent}`);
                    const packageJson = JSON.parse(packageJsonContent);
		            //logger.debug(`pacakgeJson: ${JSON.stringify(packageJson, null, 2)}`);
                    url = getGithubUrl(packageJson.repository.url as string);
		            logger.debug(`extracted URL: ${url}`);
                }
                logger.debug("Download complete");
            }
            catch (error) {
                // Error handling for download or extraction process
                logger.error(`Error in downloading repo from URL or decoding Base64 content: ${error}`);
                throw new Error('500');
            }
            try {
                // Creating a ZIP file from the downloaded content
                return_data = await ZIP('../dump2', packageMetadata.Name, packageMetadata.Version, 'rest_api');
                logger.info(`Updating package in the database with ID: ${packageId}`);
            }
            catch (error) {
                // Error handling for the ZIP creation process
                logger.error(`Error in zipping the downloaded repo: ${error}`);
                throw new Error('500');
            }

            // Fetching the rating of the package
            let packageRating : PackageRating;
            try {
                logger.debug(`Getting rating of package in PUT`);
                packageRating = await getAllRatings(url || '');
            } catch (error) {
                // Error handling for fetching package rating
                logger.error(`Error fetching package rating: ${error}`);
                throw new Error('500');
            }

            // Checking if the package rating meets the specified criteria
            /*if (packageRating && (packageRating.NetScore < 0.5 || packageRating.BusFactor < 0.5 || packageRating.Correctness < 0.5 || 
                packageRating.RampUp < 0.5 || packageRating.ResponsiveMaintainer < 0.5 || packageRating.LicenseScore < 0.5)) {
                logger.error(`Package rating is invalid`);
                throw new Error('424');
            }*/
            
            try {
                const version = packageMetadata.Version;
                //const packageRatingString = JSON.stringify(packageRating);
                logger.debug(`Updating package in the database with the following version: ${version}`);
                //logger.debug(`Updating package in the database with the following rating: ${packageRatingString}`);
                // Updating the package in the database
                await connection.execute(
                    `UPDATE ${table} SET 
                    Content = ?, 
                    Version = ?, 
                    URL = ?, 
                    BUS_FACTOR_SCORE = ?,
                    CORRECTNESS_SCORE = ?,
                    RAMP_UP_SCORE = ?,
                    RESPONSIVE_MAINTAINER_SCORE = ?,
                    LICENSE_SCORE = ?,
                    PINNED_PRACTICE_SCORE = ?,
                    PULL_REQUEST_RATING_SCORE = ?,
                    NET_SCORE  = ?,
                    WHERE ID = ?`,
                    [return_data.fileContent, 
                    packageMetadata.Version,
                    url, 
                    packageRating.BusFactor,
                    packageRating.Correctness,
                    packageRating.RampUp,
                    packageRating.ResponsiveMaintainer,
                    packageRating.LicenseScore,
                    packageRating.GoodPinningPractice,
                    packageRating.PullRequest,
                    packageRating.NetScore,
                    packageId]);

            } catch (error) {
                // Error handling for the database update process
                logger.error(`Error in updating package in the database: ${error}`);
                throw new Error('500');
            }
        } 
        try {
            // Initiating the deletion of all ZIP files after updating
            logger.debug('Initiating deletion of ZIP files');
            await deleteAllZipFiles('rest_api');
            logger.info(`Deleting directory: 'rest_api/dump2'`);
            await fs.promises.rm('rest_api/dump2', { recursive: true });
        }
        catch (error) {
            // Error handling for deleting ZIP files or directory
            logger.error(`Error in deleting ZIP files or directory: ${error}`);
            throw new Error('500');
        }
    } catch (error) {
        // Handling errors specific to fetching the package
        logger.error(`404 error: ${error}`);
        throw new Error('404');
    } finally {
        // Closing the database connection
        if (connection) {
            logger.debug('Closing database connection');
            await connection.end();
        }
    }
}

// PUT request handler for updating a package
router.put('/:id', async (req: Request, res: Response) => {
    const authenticationToken = req.get('X-Authorization');
    if(!authenticationToken || authenticationToken !== '0') {
        logger.info('PUT package/id no auth token');
        return res.status(400).json('');
    }

    logger.info('PUT package/:id');

    // Extracting package information from the request parameters
    let packageId: PackageID = req.params.id;
    packageId = req.body.metadata.ID;
    const packageData: PackageData = req.body.data;
    const packageMetadata: PackageMetadata = req.body.metadata;

    // Checking for missing fields in the request
    logger.debug("Check for missing fields.");
    logger.debug(`ID: ${packageId}`);
    const packageDataString = JSON.stringify(packageData);
    //logger.debug(`Data: ${packageDataString}`);
    const packageMetadataString = JSON.stringify(packageMetadata);
    //logger.debug(`Metadata: ${packageMetadataString}`);

    if (!packageData || (!packageData.URL && !packageData.Content) || !packageId || !packageMetadata || !packageMetadata.Name || !packageMetadata.Version || !packageMetadata.ID) {
        logger.error('Missing or improperly formed fields in PUT request');
        return res.status(400).json({ error: 'There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.' });
    }
    // Logging the reception of the PUT request
    logger.info(`Received PUT request for package update with ID: ${packageId}`);
    logger.debug(`Received PUT request for package update with URL: ${packageData.URL}`);
    logger.debug(`Received PUT request for package update with Content: ${packageData.Content}`);
    logger.info('Received PUT request for package update with metadata: ' + JSON.stringify(packageMetadata));
    try {
        // Processing the URL for npm packages
        let githubUrl = packageData.URL;
        if (githubUrl && githubUrl.includes('npmjs.com')) {
            try {
                let packageName = githubUrl.replace('https://www.npmjs.com/package/', '').split('/')[0];
                const npmData = await fetchNpmDataWithAxios(packageName);
                githubUrl = getGithubUrlFromNpmData(npmData) || undefined;
            } catch (error) {
                logger.error('Failed to fetch GitHub URL from NPMJS link: ' + githubUrl);
                return res.status(400).json({ error: 'There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.' });
            }
        }

        logger.debug(`PUT Input URL after conversion: ${githubUrl}`);

        // Updating the package using the provided data
        await updatePackage(packageId, { ...packageData, URL: githubUrl }, packageMetadata);
        res.status(200).json({ message: 'Version is updated.' });
    } catch (error: any) {
        // Handling different types of errors during the PUT request
        logger.error(`Error in PUT request for package update: ${error}`);
        if (error.message == '404') {
            res.status(404).json({ error: 'Package does not exist.' });
        } else if (error.message == '400') {
            res.status(400).json({ error: 'There is missing field(s) in the PackageID/AuthenticationToken or it is formed improperly, or the AuthenticationToken is invalid.' });
        //} else if (error.message == '424') {
        //    res.status(424).json({ error: 'Package is not uploaded due to the disqualified rating.' });
        } else {
            res.status(500).json({ error: 'Internal Server Error.' });
        }
    }
});

// Exporting the router
export default router;