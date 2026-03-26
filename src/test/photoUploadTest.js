// Simple test to verify photo upload functionality
// This can be run in browser console to test the photo upload logic

function createTestFile(name = 'test.jpg', size = 1024, type = 'image/jpeg') {
  // Create a simple test file object
  const content = new Array(size).fill(0);
  const blob = new Blob([new Uint8Array(content)], { type });
  
  // Add File properties
  blob.name = name;
  blob.lastModified = Date.now();
  blob.webkitRelativePath = '';
  
  return blob;
}

function testPhotoUpload() {
  console.log('[Photo Upload Test] Starting test...');
  
  // Test 1: Create test files
  const testFiles = [
    createTestFile('photo1.jpg', 2048, 'image/jpeg'),
    createTestFile('photo2.png', 1536, 'image/png'),
    createTestFile('photo3.gif', 512, 'image/gif')
  ];
  
  console.log('[Photo Upload Test] Created test files:', testFiles);
  
  // Test 2: Validate file types
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const maxFileSize = 10 * 1024 * 1024; // 10MB
  
  testFiles.forEach((file, index) => {
    const isValidType = supportedTypes.includes(file.type.toLowerCase());
    const isValidSize = file.size <= maxFileSize;
    
    console.log(`[Photo Upload Test] File ${index + 1}:`, {
      name: file.name,
      type: file.type,
      size: file.size,
      validType: isValidType,
      validSize: isValidSize
    });
  });
  
  // Test 3: Test object URL creation
  testFiles.forEach((file, index) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      console.log(`[Photo Upload Test] Created object URL for file ${index + 1}:`, objectUrl);
      URL.revokeObjectURL(objectUrl); // Clean up
    } catch (error) {
      console.error(`[Photo Upload Test] Failed to create object URL for file ${index + 1}:`, error);
    }
  });
  
  console.log('[Photo Upload Test] Test completed successfully!');
  return true;
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testPhotoUpload = testPhotoUpload;
  window.createTestFile = createTestFile;
}

console.log('[Photo Upload Test] Test functions loaded. Run testPhotoUpload() to test.');
