if (process.env.DEBUG_TESTS !== "1") {
  console.log = () => {};
  console.info = () => {};
}
