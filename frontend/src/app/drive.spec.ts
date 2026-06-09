import { TestBed } from '@angular/core/testing';

import { Drive } from './drive';

describe('Drive', () => {
  let service: Drive;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Drive);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
