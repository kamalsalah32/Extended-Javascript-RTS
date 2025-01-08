// 1. Function to capitalize the first letter of a string
function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// 2. Function to remove duplicates from an array
function removeDuplicates(arr) {
  return [...new Set(arr)];
}

// 3. Function to check if a number is even
function isEven(num) {
  return num % 2 === 0;
}

// 4. Function to deep clone an object
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// 5. Function to get a random integer between two values, inclusive
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 6. Function to flatten a nested array
function flattenArray(arr) {
  return arr.reduce(
    (flat, toFlatten) =>
      flat.concat(
        Array.isArray(toFlatten) ? flattenArray(toFlatten) : toFlatten
      ),
    []
  );
}

// 7. Function to format a date as YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

// 8. Function to debounce another function (delay execution until a certain amount of time has passed)
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// 9. Function to merge two objects (shallow merge)
function mergeObjects(obj1, obj2) {
  return { ...obj1, ...obj2 };
}

// 10. Function to get a random item from an array
const getRandomItem = function (arr) {
  return arr[Math.floor(Math.random() * arr.length)];
};

const areSetsssEqual = function (setA, setB) {
  if (setA.size !== setB.size) {
    return false;
  }

  for (let element of setA) {
    if (!setB.has(element)) {
      return false;
    }
  }

  return true;
};

class Person {
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
}

export {
  capitalizeFirstLetter,
  removeDuplicates,
  isEven,
  deepClone,
  getRandomInt,
  flattenArray,
  formatDate,
  debounce,
  mergeObjects,
  getRandomItem,
  areSetsssEqual,
  Person
};
