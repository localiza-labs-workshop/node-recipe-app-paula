const request = require('supertest');
const express = require('express');
const routes = require('../src/routes');
const { initializeTestDb } = require('./test-database');

// Mock the database module to use test database
jest.mock('../src/database', () => ({
  getDbConnection: () => require('./test-database').getTestDbConnection()
}));

// Simple app setup for testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Simple mock for res.render
  app.use((req, res, next) => {
    res.render = (view, locals) => res.json({ view, locals });
    next();
  });
  
  app.use('/', routes);
  return app;
}

describe('Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    app = createTestApp();
    db = await initializeTestDb();
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  test('GET / should return 200', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.view).toBe('home');
  });

  test('POST /recipes should create a new recipe', async () => {
    const newRecipe = {
      title: 'New Test Recipe',
      ingredients: 'New test ingredients',
      method: 'New test method'
    };

    const response = await request(app)
      .post('/recipes')
      .send(newRecipe);

    expect(response.status).toBe(302); // Redirect status
    expect(response.headers.location).toBe('/recipes');

    // Verify recipe was created
    const recipe = await db.get('SELECT * FROM recipes WHERE title = ?', [newRecipe.title]);
    expect(recipe).toBeDefined();
    expect(recipe.title).toBe(newRecipe.title);
  });

  test('POST /recipes should return 400 when title is empty', async () => {
    const response = await request(app)
      .post('/recipes')
      .send({
        title: '   ',
        ingredients: 'Test ingredients',
        method: 'Test method'
      });

    expect(response.status).toBe(400);
    expect(response.body.view).toBe('recipes');
    expect(response.body.locals.errorMessage).toBe('Recipe title is required');
    expect(response.body.locals.showAddForm).toBe(true);
    expect(response.body.locals.formData).toEqual({
      title: '',
      ingredients: 'Test ingredients',
      method: 'Test method'
    });

    const recipes = await db.all('SELECT * FROM recipes');
    expect(recipes).toEqual([]);
  });

  test('DELETE /recipes/:id should remove the recipe and return 404 afterwards', async () => {
    const insertedRecipe = await db.run(
      'INSERT INTO recipes (title, ingredients, method) VALUES (?, ?, ?)',
      ['Delete Test Recipe', 'Delete ingredients', 'Delete method']
    );

    const deleteResponse = await request(app).delete(`/recipes/${insertedRecipe.lastID}`);
    expect(deleteResponse.status).toBe(302);
    expect(deleteResponse.headers.location).toBe('/recipes');

    const deletedRecipe = await db.get('SELECT * FROM recipes WHERE id = ?', [insertedRecipe.lastID]);
    expect(deletedRecipe).toBeUndefined();

    const missingRecipeResponse = await request(app).get(`/recipes/${insertedRecipe.lastID}`);
    expect(missingRecipeResponse.status).toBe(404);
  });
});