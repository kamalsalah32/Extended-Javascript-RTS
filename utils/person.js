const Person = class {
  // Public property
  name;

  // Private property (using # for private fields)
  #age;

  // Static property
  static species = 'Homo sapiens';

  // Constructor
  constructor(name, age) {
    this.name = name; // Assigning public property
    this.#age = age; // Assigning private property
  }

  get age() {
    return this.#age;
  }

  set age(age) {
    this.#age = age;
  }

  // Public instance method
  introduce() {
    console.log(`Hi, my name is ${this.name} and I am ${this.#age} years old.`);
  }

  // Private instance method
  #secretMethod() {
    console.log(
      'This is a private method that cannot be accessed directly from an instance.'
    );
  }

  // Static method
  static identifySpecies() {
    console.log(`We all belong to the species: ${Person.species}`);
  }

  InnerClass = class {};
};
