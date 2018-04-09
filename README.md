# Basic example of using Moveshelf API to upload data from Node.js

The [Moveshelf](https://moveshelf.com) API uses [GraphQL](http://graphql.org)
for data access. This project demonstrates basic interaction with this API to
upload data to the Moveshelf platform.

## Setup

### Dependencies and build
Example uses `npm` for dependencies, and is written using Typescript.
To get started the project dependencies should be installed, and the code compiled
to JavaScript:

```sh
npm install
npm run build
```

*Note that while the example uses the [Apollo](https://apollographql.com)
library for GraphQL interaction, and [axios](https://github.com/axios/axios)
for HTTP operations, these are not strictly necessary. GraphQL can be used
without special libraries. For example see the
[Moveshelf Unity Integration](https://github.com/moveshelf/mvshlf-unity) project.*

### API key
To access the Moveshelf API an access key should be created:

1. Login to [Moveshelf](https://moveshelf.com)
2. Navigate to your profile
3. In the API Keys section under your avatar enter an ID for the new key, e.g. 'api_test'
4. Click on 'Generate API Key'
5. In the resulting modal dialog click 'Download Key' to save the API key in a JSON file.
Save the key as `mvshlf-api-key.json` in the project root directory.

**The API key should be kept secret.**

## Running

The `dist/cli.js` file provides a simple command line interface to the API.
Commands can be run either as `node dist/cli.js <cmd>` or `npm start <cmd>`.

You can get basic help on commands by using the `--help` option, i.e. `node dist/cli.js --help`.

### Listing available projects

Listing projects demonstrates the use of GraphQL queries to request data. The
request is implemented in file the `src/api.ts` by the `MoveshelfApi.getUserProjects()`
method:

```ts
  public getUserProjects(): Promise<string[]> {
    return this.apollo.query<any>({
      query: gql`
        query {
          viewer {
            projects {
              name
            }
          }
        }
      `
    }).then(({data}) => {
      return Promise.resolve(data.viewer.projects.map(p => p.name))
    });
  }
```

This query uses the `viewer` field to access the authenticated user's data.

You can list your available projects by running:

```sh
node dist/cli.js list
```

### Uploading data

To upload data to Moveshelf requires four steps:

1. Create a metadata object describing the motion data.
2. Calculate a CRC32C of the data -- used to verify that no data corruption has occurred.
3. Create a record of the data via the API. This allocates a unique identifier for the data, and generates an upload URL.
4. Upload the data. Data is encrypted and stored redundantly in multiple data centers.

The clip metadata is described by a simple interface:

```ts
interface Metadata {
  title?: string,
  description?: string,
  previewImageUri?: string,
  allowDownload?: boolean,
  allowUnlistedAccess?: boolean
};
```

The motion capture clip is uploaded using the `MoveshelfApi.uploadFile()` method:

```ts
  public uploadFile( filePath: string, project: string, metadata: Metadata = {}): Promise<axios.AxiosResponse> {
    console.info('Uploading:', filePath)

    metadata.title = metadata.title || path.basename(filePath);
    metadata.allowDownload = metadata.allowDownload === true;
    metadata.allowUnlistedAccess = metadata.allowUnlistedAccess === true;

    return readFile(filePath)
      .then(fileContents => {
        return Promise.all([
          fileContents,
          this.createClip(project, {
            clientId: filePath,
            crc32c: calculateCrc32c(fileContents),
            filename: path.basename(filePath),
            metadata: metadata
          })
        ]);
      })
      .then(([fileContents, createResponse]) => {
        console.info("Created clip ID:", createResponse.mocapClip.id)
        return axios.default.put(createResponse.uploadUrl, fileContents)
      });
  }
```

Note that the metadata fields are optional, but in this example we have explicitly
set some of them. The default values provided by the API are:

| Field                 | Default    |
| -------------------   | ---------- |
| `title`               | "Untitled" |
| `description`         | `null`     |
| `previewImageUri`     | `null`     |
| `allowDownload`       | `false`    |
| `allowUnlistedAccess` | `false`    |


The API call for creating the motion capture clip record is implemented by the
`MoveshelfApi.createClip()` method, which uses a GraphQL mutation to update the
data stored on the Moveshelf platform:

```ts
  private createClip(project: string, data: ClipCreationData): Promise<ClipCreationResponse> {
    return this.apollo.mutate({
      mutation: gql`
        mutation createClip($input: ClipCreationInput!) {
          createClips(input: $input) {
            response {
              clientId,
              uploadUrl,
              mocapClip {
                id
              }
            }
          }
        }
      `,
      variables: {
        input: {
          project: project,
          clips: [ data ]
        }
      }
    })
    .then(({data}) => {
      return Promise.resolve(data.createClips.response[0])
    });
```
Note how the `response` query includes the `clientId`, `uploadUrl` and
`mocapClip.id` fields. Only the `uploadUrl` is strictly required for the upload
process, but the other fields are also often useful. The `clientId` can be used
to correlate the created clips to the user data in the case of multiple
uploads, while the `mocapClip.id` can be used to reference data from external
systems.

To test the upload process run the uploadFile command:

```sh
node dist/cli.js uploadFile <filePath> <project>
```

For example:

```sh
node dist/cli.js uploadFile test.fbx username/private --title test
```


