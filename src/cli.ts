import * as fs from 'fs';
import { ApolloClient } from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import { setContext } from 'apollo-link-context';
import { InMemoryCache } from 'apollo-cache-inmemory';

import fetch from 'node-fetch';
import * as yargs from 'yargs';

import { MoveshelfApi } from './api';

const apiToken = JSON.parse(fs.readFileSync('mvshlf-api-key.json', {encoding: 'utf8'})).secretKey;

const httpLink = new HttpLink({
  uri: 'https://api.moveshelf.com/graphql',
  fetch: fetch
});

const authMiddleware = setContext(() => {
  return { headers: { authorization: `Bearer ${apiToken}` }};
});

const apolloClient = new ApolloClient({
  link: authMiddleware.concat(httpLink),
  cache: new InMemoryCache()
});

const api = new MoveshelfApi(apolloClient);

let args = yargs
  .command(['listProjects', 'list'], 'List available projects', {}, (args) => {
    api.getUserProjects().then(projects => projects.map(p => console.log(p)));
  })
  .command(['uploadFile <filePath> <projectName>', 'up'], 'Upload a file',
    yargs => {
      return yargs
        .positional('filePath', {desc: 'Path of file to upload', type: 'string'})
        .positional('projectName', {desc: 'Project to add file to. See "listProjects"', type: 'string'})
        .option('title', {desc: 'Title of clip', type: 'string'})
        .option('description', {desc: 'Description of clip', type: 'string'})
        .option('allowDownload', {desc: 'Allow download of original data', type: 'boolean'})
        .option('allowUnlistedAccess', {desc: 'Allow access to preview to anyone in possesion of URL', type: 'boolean'})
    }, (args) => {
      api.uploadFile(args.filePath, args.projectName, {
        title: args.title,
        description: args.description,
        allowDownload: args.allowDownload,
        allowUnlistedAccess: args.allowUnlistedAccess
      }).then(() => console.log("Upload complete"));
    }
  )
  .demandCommand()
  .help()
  .argv
