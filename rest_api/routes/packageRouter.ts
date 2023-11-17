
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '../schema';
import { connectToDatabase } from "../db";

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    const { Content, JSProgram, URL } = req.body as schema.PackageData;
    
    // checks if only either Content or URL is being passsed when inserting a package
    if (!((Content && JSProgram && !URL) || (URL && JSProgram && !Content))) {
        return res.status(400).json({
            error: "There is missing field(s) in the PackageData or it is formed improperly."
        });
    }

    if (URL) {
        downloadRepo(URL);
    } else {
        
    }
    // read package.json and get name, version, and link
    // call metrics for the code and store it in database
    // re-zip into base64 to be stores into the database

    // test cases
    /**

    1. unzip successful
    2. unzip fails (error)
    3. no package.json (error)
    4. package.json has no version or link or name (error)
    5. rezip successful
    6. rezip fails (error)

    // errors
    7. database INSERT fails for metrics
    8. database INSERT fails for zip file

   **/

//
//    if (await checkPackageExistence(Content, URL)) {
//        return res.status(409).json({
//            error: "Package exists already."
//        });
//    }

//    // Check the NetScore in the rating
//    if (rating && rating.NetScore !== -1 && rating.NetScore <= 0.5) {
//        return res.status(424).json({
//            error: "Package is not uploaded due to the disqualified rating."
//        });
//    }
    
    // connecting to the mysql database
    const connection = await connectToDatabase();
    let name = 'overscore3';
    let version = '1.0.0';
    let id = 'overscore3';
    let responseData : schema.Package;
    if (Content) {
        
        try {
            const [results] = await connection.execute( 
                'INSERT INTO packages (Name, Version, ID, Content, JSProgram) VALUES (?, ?, ?, ?, ?)'
                , [name, version, id, Content, JSProgram]);
            await connection.end();
            responseData = {
                metadata: { Name:name, Version:version, ID:id },
                data: { Content, JSProgram }
            };
            
        } catch (error) {
            return res.status(500).json({
                error: "Failed to insert Content to database. Please try again later."
            });
        }
        
    } else if (URL) {
        console.log('entered');
        try {
            const [results] = await connection.execute(
                'INSERT INTO packages (Name, Version, ID, URL, JSProgram) VALUES (?, ?, ?, ?, ?)'
                , [name, version, id, URL, JSProgram]);
            await connection.end();
            responseData = {
                metadata: { Name:name, Version:version, ID:id },
                data: { URL, JSProgram }
            };

        } catch (error) {
            return res.status(500).json({
                error: "Failed to insert URL to the database. Please try again later."
            });
        }

    } else {
        throw new Error('Package is missing Content/URL');
    }

    return res.status(201).json(responseData);
});

//async function savePackageByContent(data: { Content: string; JSProgram: string;}): Promise<void> {
//    try {
//        console.log(data);
//        const response = await axios.post("", data);
//
//        if (response.status !== 200) {
//            throw new Error('Failed to save package to the provided URL.');
//        }
//    } catch (error) {
//        //logger.error(`Error in savePackageToURL: ${error}`);
//        throw new Error('Failed to save package to the provided URL.');
//    }
//}

//async function checkPackageExistence(content: any, URL: any): Promise<boolean> {
//    try {
//        const response = await axios.get(URL, {
////            headers: {
////                'X-Authorization': xAuthorization
////            },
//            params: {
//                content: content
//            }
//        });
//
//        return response.data && response.data.length > 0;
//    } catch (error) {
//        //logger.error(`Error in checkPackageExistence: ${error}`);
//        return false;
//    }
//}

function downloadRepo(url: string): string {
    
    let destinationFolder = './extracted_contents';
    const gitCloneCommand = `git clone ${url} ${destinationFolder}`;

    // Run the git clone command
    exec(gitCloneCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log(`Repository cloned successfully: ${stdout}`);
    });


    // Read the package.json file
    const packageJsonPath = path.join(destinationFolder, 'package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
    
    try {
        
        // Define the regular expression pattern to match GitHub URLs
//        const githubUrlPattern = /"repository"\s*:\s*{\s*"type"\s*:\s*"git",\s*"url"\s*:\s*"(git\+https:\/\/github\.com\/|https:\/\/github\.com\/|git:\/\/github\.com\/)([^"]+\.git)"/;
//        const match = packageJsonContent.match(githubUrlPattern);

//        // If a match is found, return the GitHub URL
//        if (match && match[2]) {
//            const githubUrl = match[2];
//            // Modify the GitHub URL to the desired format
//            const formattedUrl = githubUrl.replace(/\.git$/, '');            // If no match is found, return null
//            console.log(formattedUrl);
//
//        }

    } catch (error) {
        console.error('Error:', error.message || error);
    }


}


export default router;