import { extractDependencies } from '../src/app/services/dependency-inventory.service';

describe('Dependency inventory extraction', function ()
{
    it('extracts exact versions from JavaScript, PHP, Python, Ruby, Go, and Rust lockfiles', function ()
    {
        const dependencies = extractDependencies(
            [
                {
                    path: 'package-lock.json',
                    content: JSON.stringify(
                        {
                            lockfileVersion: 3,
                            packages:
                            {
                                'node_modules/lodash': { version: '4.17.20' },
                                'node_modules/@scope/tool': { version: '1.2.3' }
                            }
                        }
                    )
                },
                {
                    path: 'composer.lock',
                    content: JSON.stringify({ packages: [{ name: 'symfony/http-foundation', version: 'v6.0.1' }] })
                },
                {
                    path: 'requirements.txt',
                    content: 'Django==4.2.1\nrequests>=2.0\n'
                },
                {
                    path: 'Gemfile.lock',
                    content: 'GEM\n  specs:\n    rack (2.2.3)\n      ruby2_keywords\n\nPLATFORMS\n'
                },
                {
                    path: 'go.sum',
                    content: 'golang.org/x/text v0.3.7 h1:abc\ngolang.org/x/text v0.3.7/go.mod h1:def\n'
                },
                {
                    path: 'Cargo.lock',
                    content: '[[package]]\nname = "time"\nversion = "0.3.20"\n'
                }
            ]
        );

        expect(dependencies).toEqual(expect.arrayContaining(
            [
                expect.objectContaining({ ecosystem: 'npm', name: 'lodash', version: '4.17.20' }),
                expect.objectContaining({ ecosystem: 'npm', name: '@scope/tool', version: '1.2.3' }),
                expect.objectContaining({ ecosystem: 'Packagist', name: 'symfony/http-foundation', version: '6.0.1' }),
                expect.objectContaining({ ecosystem: 'PyPI', name: 'Django', version: '4.2.1' }),
                expect.objectContaining({ ecosystem: 'RubyGems', name: 'rack', version: '2.2.3' }),
                expect.objectContaining({ ecosystem: 'Go', name: 'golang.org/x/text', version: '0.3.7' }),
                expect.objectContaining({ ecosystem: 'crates.io', name: 'time', version: '0.3.20' })
            ]
        ));
    });

    it('extracts exact versions from JVM, .NET, Dart, Swift, Elixir, R, Julia, and Haskell files', function ()
    {
        const dependencies = extractDependencies(
            [
                {
                    path: 'pom.xml',
                    content: '<project><properties><junit.version>4.12</junit.version></properties><dependencies><dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>${junit.version}</version></dependency></dependencies></project>'
                },
                {
                    path: 'packages.lock.json',
                    content: JSON.stringify({ dependencies: { 'net8.0': { NewtonsoftJson: { resolved: '12.0.1' } } } })
                },
                {
                    path: 'pubspec.lock',
                    content: 'packages:\n  http:\n    dependency: direct main\n    version: "0.13.0"\n'
                },
                {
                    path: 'Package.resolved',
                    content: JSON.stringify({ pins: [{ identity: 'swift-nio', location: 'https://github.com/apple/swift-nio.git', state: { version: '2.40.0' } }] })
                },
                {
                    path: 'mix.lock',
                    content: '%{"plug": {:hex, :plug, "1.12.1", "checksum", [:mix], [], "hexpm", "checksum"}}'
                },
                {
                    path: 'renv.lock',
                    content: JSON.stringify({ Packages: { readxl: { Version: '1.4.1' } } })
                },
                {
                    path: 'Manifest.toml',
                    content: '[[deps.HTTP]]\nversion = "1.10.0"\n'
                },
                {
                    path: 'cabal.project.freeze',
                    content: 'constraints: any.x509-validation ==1.4.7,\n             any.text ==2.0.1\n'
                }
            ]
        );

        expect(dependencies).toEqual(expect.arrayContaining(
            [
                expect.objectContaining({ ecosystem: 'Maven', name: 'junit:junit', version: '4.12' }),
                expect.objectContaining({ ecosystem: 'NuGet', name: 'NewtonsoftJson', version: '12.0.1' }),
                expect.objectContaining({ ecosystem: 'Pub', name: 'http', version: '0.13.0' }),
                expect.objectContaining({ ecosystem: 'SwiftURL', name: 'https://github.com/apple/swift-nio.git', version: '2.40.0' }),
                expect.objectContaining({ ecosystem: 'Hex', name: 'plug', version: '1.12.1' }),
                expect.objectContaining({ ecosystem: 'CRAN', name: 'readxl', version: '1.4.1' }),
                expect.objectContaining({ ecosystem: 'Julia', name: 'HTTP', version: '1.10.0' }),
                expect.objectContaining({ ecosystem: 'Hackage', name: 'x509-validation', version: '1.4.7' })
            ]
        ));
    });

    it('ignores unresolved manifest ranges because they do not identify an installed version', function ()
    {
        const dependencies = extractDependencies(
            [
                {
                    path: 'package.json',
                    content: JSON.stringify({ dependencies: { express: '^4.18.0', lodash: '4.17.20' } })
                },
                {
                    path: 'composer.json',
                    content: JSON.stringify({ require: { php: '^8.2', 'vendor/package': '~1.2', 'vendor/pinned': '1.0.0' } })
                }
            ]
        );

        expect(dependencies.some((dependency) => dependency.name === 'express')).toBe(false);
        expect(dependencies.some((dependency) => dependency.name === 'vendor/package')).toBe(false);
        expect(dependencies).toEqual(expect.arrayContaining(
            [
                expect.objectContaining({ name: 'lodash', version: '4.17.20' }),
                expect.objectContaining({ name: 'vendor/pinned', version: '1.0.0' })
            ]
        ));
    });
});
