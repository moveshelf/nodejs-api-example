import * as fs from 'fs';
import * as util from 'util';
import * as path from 'path';

import { ApolloClient } from 'apollo-client';
import gql from 'graphql-tag';
import * as axios from 'axios';

import { calculateCrc32c } from './crc32c';

const readFile = util.promisify(fs.readFile);

interface Metadata {
  title?: string,
  description?: string,
  previewImageUri?: string,
  allowDownload?: boolean,
  allowUnlistedAccess?: boolean
};

interface ClipCreationData {
  clientId: string,
  crc32c: string,
  filename: string,
  metadata: Metadata
};

interface ClipCreationResponse {
  uploadUrl: string,
  mocapClip: {
    id: string
  }
}

export class MoveshelfApi {
  constructor(private apollo: ApolloClient<any>) {}

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
  }
}
