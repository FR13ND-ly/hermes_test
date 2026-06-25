import { Routes } from '@angular/router';
import { DatabaseCrudComponent } from './components/database-crud';
import { RedisCacheComponent } from './components/redis-cache';
import { BaasAuthComponent } from './components/baas-auth';
import { FileStorageComponent } from './components/file-storage';
import { ServerlessComponent } from './components/serverless';
import { CronsComponent } from './components/crons';
import { SettingsComponent } from './components/settings';

export const routes: Routes = [
  { path: 'database', component: DatabaseCrudComponent },
  { path: 'redis', component: RedisCacheComponent },
  { path: 'auth', component: BaasAuthComponent },
  { path: 'storage', component: FileStorageComponent },
  { path: 'serverless', component: ServerlessComponent },
  { path: 'crons', component: CronsComponent },
  { path: 'settings', component: SettingsComponent },
  { path: '', redirectTo: 'database', pathMatch: 'full' }
];
